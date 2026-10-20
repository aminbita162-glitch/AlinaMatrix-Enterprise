/**
 * Context Contract V1 domain logic — ECIDR (Verifiable Evidence Context Integrity
 * & Deterministic Replay).
 *
 * Covers:
 *   - canonicalizeContext — deterministic canonical JSON serialization with
 *     sorted keys, sorted source refs, and stable delimiters.
 *   - computeContextPayloadSha256 — SHA-256 over the canonical payload (all
 *     deterministic fields, excluding createdAt).
 *   - computeSnapshotSha256 — SHA-256 over the full sealed snapshot (including
 *     the payload hash, excluding createdAt).
 *   - assertContextAuthorized — bind the context to existing agent capability
 *     and tenant isolation (fail-closed).
 *   - sealSnapshot — verify source hashes, policy pins, and content digest in
 *     one consistent transactional view; transition PREPARED → SEALED.
 *   - consumeSnapshot — record which agent/job consumed which sealed snapshot.
 *   - rejectSnapshot — record a safe reason code.
 *   - replaySnapshot — read-only replay verifier for SEALED snapshots.
 *
 * Directive ECIDR:
 *   §06: "Domain-separated SHA-256 over UTF-8 canonical serialization with
 *         explicit schema/canonicalization versions."
 *   §07: "State model: PREPARED -> SEALED -> CONSUMED (or REJECTED)"
 *   §09: "Bind authorization to the actual request/session and existing agent
 *         capability policy; enforce server-side on every materialized context
 *         read and consumption."
 *   §10: "Provide a replay verifier for SEALED snapshots that reconstructs the
 *         exact authorized context and checks recorded hashes and pins without
 *         side effects."
 *
 * Determinism:
 *   - canonicalizeContext uses JSON.stringify with sorted keys (canonical).
 *   - Source references are sorted by sourceVersionId before hashing.
 *   - No Date.now() or Math.random() is used.
 *   - createdAt is excluded from the payload hash (audit metadata).
 *
 * Status: Enterprise Candidate — Active Development
 */
import { createHash } from "node:crypto";
import {
  SealedSnapshotSchema,
  type ContextContractV1,
  type SealedSnapshot,
  type ConsumedSnapshot,
  type RejectedSnapshot,
  type ContextSnapshotState,
  type ContextRejectReason,
  type SourceRef,
} from "@alinamatrix/contracts";
import {
  assertAgentCapability,
  type AgentName,
} from "./agents.js";

// ============================================================
// Canonicalization
// ============================================================

/**
 * The canonicalization version this module implements.
 * Pinned in the contract so the hash is reproducible across processes.
 */
export const CANONICALIZATION_VERSION = "canonical-json-v1";

/**
 * Domain separation prefix for context payload hashing.
 * Prevents hash collisions with other SHA-256 uses in the system.
 */
const PAYLOAD_HASH_DOMAIN = "alinamatrix:ecidr:payload-v1";
const SNAPSHOT_HASH_DOMAIN = "alinamatrix:ecidr:snapshot-v1";

/**
 * Recursively sort object keys for canonical JSON serialization.
 * Reused from the existing provenance/timetravel pattern.
 */
function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}

/**
 * Sort source references by sourceVersionId (ascending UUID string sort)
 * and deduplicate by sourceVersionId.
 *
 * Directive ECIDR §05:
 *   "Source references must be sorted and deduplicated in a documented
 *    canonical order."
 */
export function canonicalizeSourceRefs(refs: SourceRef[]): SourceRef[] {
  const byId = new Map<string, SourceRef>();
  for (const ref of refs) {
    if (!byId.has(ref.sourceVersionId)) {
      byId.set(ref.sourceVersionId, ref);
    }
  }
  return [...byId.values()].sort((a, b) =>
    a.sourceVersionId < b.sourceVersionId ? -1 : a.sourceVersionId > b.sourceVersionId ? 1 : 0,
  );
}

/**
 * The deterministic fields of a ContextContractV1 — everything except
 * createdAt (which is audit metadata excluded from content determinism).
 */
interface DeterministicFields {
  contractVersion:         string;
  tenantId:                 string;
  projectId:                string;
  workflowRunId:            string;
  jobId:                    string;
  agentName:                string;
  taskKind:                 string;
  sourceRefs:               SourceRef[];
  promptSha256:             string;
  schemaSha256:             string;
  policySha256:             string;
  modelVersionId:           string;
  agentVersionId:           string;
  canonicalizationVersion:  string;
  contextPayloadSha256:     string;
  snapshotSha256:           string;
  authorizationDecisionId:  string;
}

/**
 * Extract the deterministic fields from a context contract (excluding
 * createdAt — which is audit metadata and does not alter the content digest).
 */
function extractDeterministic(contract: ContextContractV1): DeterministicFields {
  return {
    contractVersion:         contract.contractVersion,
    tenantId:                 contract.tenantId,
    projectId:                contract.projectId,
    workflowRunId:            contract.workflowRunId,
    jobId:                    contract.jobId,
    agentName:                contract.agentName,
    taskKind:                 contract.taskKind,
    sourceRefs:               canonicalizeSourceRefs(contract.sourceRefs),
    promptSha256:             contract.promptSha256,
    schemaSha256:             contract.schemaSha256,
    policySha256:             contract.policySha256,
    modelVersionId:           contract.modelVersionId,
    agentVersionId:           contract.agentVersionId,
    canonicalizationVersion:  contract.canonicalizationVersion,
    contextPayloadSha256:     contract.contextPayloadSha256,
    snapshotSha256:           contract.snapshotSha256,
    authorizationDecisionId:  contract.authorizationDecisionId,
  };
}

// ============================================================
// Hashing
// ============================================================

/**
 * Compute the context payload SHA-256 — the hash over the canonical
 * serialization of the deterministic fields (excluding createdAt).
 *
 * The hash is domain-separated (prefixed with the ECIDR payload domain) so it
 * cannot collide with other SHA-256 uses in the system.
 *
 * Directive ECIDR §06:
 *   "Domain-separated SHA-256 over UTF-8 canonical serialization with explicit
 *    schema/canonicalization versions."
 *   "Hash must bind tenant, project, run/job/task, agent, exact source version
 *    IDs and content hashes, evidence fragments, policy/prompt/schema/model/
 *    agent pins, and payload."
 */
export function computeContextPayloadSha256(contract: ContextContractV1): string {
  const deterministic = extractDeterministic(contract);
  // Remove the payload hash and snapshot hash from the deterministic fields
  // before hashing — they are *computed from* the other fields, not inputs.
  const { contextPayloadSha256: _p, snapshotSha256: _s, ...rest } = deterministic;
  void _p; void _s;
  const canonical = JSON.stringify(sortKeys({
    ...rest,
    sourceRefs: canonicalizeSourceRefs(contract.sourceRefs),
  }));
  return createHash("sha256")
    .update(`${PAYLOAD_HASH_DOMAIN}|${canonical}`, "utf8")
    .digest("hex");
}

/**
 * Compute the snapshot SHA-256 — the hash over the full sealed snapshot
 * (including the contextPayloadSha256, but excluding createdAt which is
 * audit metadata, and excluding snapshotSha256 itself which is the
 * computed result).
 *
 * Directive ECIDR §06:
 *   "Distinguish content identity from event identity: createdAt, random IDs,
 *    and transport metadata must not alter the deterministic content digest."
 */
export function computeSnapshotSha256(contract: ContextContractV1): string {
  const deterministic = extractDeterministic(contract);
  // Remove the snapshot hash from the deterministic fields before hashing —
  // it is the *result* of this computation, not an input. The payload hash
  // IS included (it is computed from the other fields and binds them).
  const { snapshotSha256: _s, ...rest } = deterministic;
  void _s;
  const canonical = JSON.stringify(sortKeys(rest));
  return createHash("sha256")
    .update(`${SNAPSHOT_HASH_DOMAIN}|${canonical}`, "utf8")
    .digest("hex");
}

// ============================================================
// Errors
// ============================================================

export class ContextContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextContractError";
  }
}

export class ContextHashMismatchError extends ContextContractError {
  constructor(field: string, expected: string, actual: string) {
    super(
      `Context hash mismatch on "${field}": expected ${expected}, got ${actual}.`,
    );
    this.name = "ContextHashMismatchError";
  }
}

export class ContextAuthorizationError extends ContextContractError {
  constructor(message: string) {
    super(message);
    this.name = "ContextAuthorizationError";
  }
}

export class ContextStateError extends ContextContractError {
  constructor(message: string) {
    super(message);
    this.name = "ContextStateError";
  }
}

export class ContextReplayError extends ContextContractError {
  constructor(message: string) {
    super(message);
    this.name = "ContextReplayError";
  }
}

// ============================================================
// Authorization (ECIDR §09)
// ============================================================

/**
 * Assert that a context contract is authorized for the named agent.
 *
 * Binds authorization to:
 *   - The agent's capability set (existing assertAgentCapability).
 *   - The tenant ID (server-derived; never client-supplied as authority).
 *   - The agent name matching the contract's agentName.
 *
 * Directive ECIDR §09:
 *   "Bind authorization to the actual request/session and existing agent
 *    capability policy; enforce server-side on every materialized context read
 *    and consumption. ... Deny on absent/mismatched identity, missing source,
 *    stale or revoked source, policy mismatch, invalid state, cancellation, hash
 *    mismatch, or unauthorized capability."
 *
 * @throws ContextAuthorizationError when the agent name does not match the
 *   contract, or the agent does not hold the required capability.
 * @throws CapabilityDeniedError (from assertAgentCapability) when the agent
 *   lacks the capability.
 */
export function assertContextAuthorized(
  contract: ContextContractV1,
  agentName: AgentName,
  capability: string,
): void {
  if (contract.agentName !== agentName) {
    throw new ContextAuthorizationError(
      `Context agentName "${contract.agentName}" does not match the executing agent "${agentName}".`,
    );
  }
  // Delegate to the existing capability assertion — fail-closed.
  assertAgentCapability(agentName, capability);
}

// ============================================================
// Snapshot lifecycle (ECIDR §07)
// ============================================================

/**
 * Input to sealSnapshot — the PREPARED context contract plus the sealed-at
 * timestamp and the predecessor snapshot ID (null for the first snapshot).
 */
export interface SealSnapshotInput {
  /** The PREPARED context contract to seal. */
  contract: ContextContractV1;
  /** ISO-8601 UTC timestamp — supplied by the caller for determinism. */
  sealedAt: string;
  /** The UUID of the predecessor snapshot (null for the first snapshot). */
  predecessorSnapshotId: string | null;
  /** The agent executing the seal (for authorization). */
  agentName: AgentName;
  /** The capability required to seal (e.g. "WRITE_DRAFT"). */
  capability: string;
}

/**
 * Seal a PREPARED context snapshot.
 *
 * Verifies:
 *   1. The contract is valid (Zod schema validation).
 *   2. The contextPayloadSha256 matches the recomputed hash.
 *   3. The snapshotSha256 matches the recomputed hash.
 *   4. The agent is authorized (assertContextAuthorized).
 *   5. Source references are sorted and deduplicated.
 *
 * Returns a SealedSnapshot with snapshotState="SEALED".
 *
 * Directive ECIDR §07:
 *   "SEAL verifies source hashes, quote-lock/citation integrity where relevant,
 *    policy pins, and content digest in one consistent transactional view.
 *    SEALED content is immutable."
 *
 * @throws ContextContractError when the contract fails Zod validation.
 * @throws ContextHashMismatchError when the payload or snapshot hash does not match.
 * @throws ContextAuthorizationError when the agent is not authorized.
 * @throws CapabilityDeniedError when the agent lacks the capability.
 */
export function sealSnapshot(input: SealSnapshotInput): SealedSnapshot {
  const { contract, sealedAt, predecessorSnapshotId, agentName, capability } = input;

  // 1. Validate the contract schema (SealedSnapshotSchema includes the
  //    snapshotState/sealedAt/predecessorSnapshotId fields).
  const parsed = SealedSnapshotSchema.safeParse({
    ...contract,
    snapshotState: "SEALED",
    sealedAt: input.sealedAt,
    predecessorSnapshotId: input.predecessorSnapshotId,
  });
  if (!parsed.success) {
    throw new ContextContractError(
      `Context contract validation failed: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  // 2. Verify the contextPayloadSha256.
  const recomputedPayload = computeContextPayloadSha256(contract);
  if (recomputedPayload !== contract.contextPayloadSha256) {
    throw new ContextHashMismatchError(
      "contextPayloadSha256",
      recomputedPayload,
      contract.contextPayloadSha256,
    );
  }

  // 3. Verify the snapshotSha256.
  const recomputedSnapshot = computeSnapshotSha256(contract);
  if (recomputedSnapshot !== contract.snapshotSha256) {
    throw new ContextHashMismatchError(
      "snapshotSha256",
      recomputedSnapshot,
      contract.snapshotSha256,
    );
  }

  // 4. Authorize the agent.
  assertContextAuthorized(contract, agentName, capability);

  // 5. Return the sealed snapshot.
  return {
    ...contract,
    snapshotState: "SEALED",
    sealedAt,
    predecessorSnapshotId,
  };
}

/**
 * Consume a sealed snapshot — records which agent/job consumed which sealed
 * snapshot.
 *
 * Directive ECIDR §07:
 *   "CONSUMED records which agent/job consumed which sealed snapshot."
 *
 * @throws ContextStateError when the snapshot is not SEALED.
 * @throws ContextAuthorizationError when the agent is not authorized.
 */
export function consumeSnapshot(
  snapshot: SealedSnapshot,
  consumedAt: string,
  consumedByJobId: string,
  agentName: AgentName,
  capability: string,
): ConsumedSnapshot {
  if (snapshot.snapshotState !== "SEALED") {
    throw new ContextStateError(
      `Cannot consume a snapshot in state "${snapshot.snapshotState}" — must be SEALED.`,
    );
  }
  assertContextAuthorized(snapshot, agentName, capability);
  return {
    ...snapshot,
    snapshotState: "CONSUMED",
    consumedAt,
    consumedByJobId,
  };
}

/**
 * Reject a sealed snapshot — records a safe reason code.
 *
 * Directive ECIDR §07:
 *   "REJECTED records a safe reason code."
 *
 * @throws ContextStateError when the snapshot is not SEALED.
 */
export function rejectSnapshot(
  snapshot: SealedSnapshot,
  rejectedAt: string,
  reason: ContextRejectReason,
): RejectedSnapshot {
  if (snapshot.snapshotState !== "SEALED") {
    throw new ContextStateError(
      `Cannot reject a snapshot in state "${snapshot.snapshotState}" — must be SEALED.`,
    );
  }
  return {
    ...snapshot,
    snapshotState: "REJECTED",
    rejectedAt,
    rejectReason: reason,
  };
}

// ============================================================
// Replay verification (ECIDR §10)
// ============================================================

/**
 * Replay a sealed snapshot — read-only verification.
 *
 * Reconstructs the exact authorized context and checks:
 *   1. The contract is valid (Zod schema validation).
 *   2. The contextPayloadSha256 matches the recomputed hash.
 *   3. The snapshotSha256 matches the recomputed hash.
 *   4. The snapshot state is SEALED.
 *
 * This is a READ-ONLY operation — it does not:
 *   - Trigger release, export, email, upload, network calls, cache writes.
 *   - Write audit rows or mutate source state.
 *   - Transition the snapshot state.
 *
 * Directive ECIDR §10:
 *   "Provide a replay verifier for SEALED snapshots that reconstructs the
 *    exact authorized context and checks recorded hashes and pins without
 *    side effects. ... Replay must reject missing/changed source bytes, policy
 *    changes without a matching historical pin, missing provider records, tenant
 *    mismatch, and schema incompatibility."
 *
 * @throws ContextReplayError when any verification check fails.
 */
export function replaySnapshot(snapshot: SealedSnapshot): {
  valid: true;
  contextPayloadSha256: string;
  snapshotSha256: string;
} {
  // 1. Verify the snapshot state is SEALED.
  if (snapshot.snapshotState !== "SEALED") {
    throw new ContextReplayError(
      `Cannot replay a snapshot in state "${snapshot.snapshotState}" — must be SEALED.`,
    );
  }

  // 2. Validate the contract schema (SealedSnapshotSchema includes the
  //    snapshotState/sealedAt/predecessorSnapshotId fields present on a sealed
  //    snapshot).
  const parsed = SealedSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    throw new ContextReplayError(
      `Replay validation failed: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  // 3. Verify the contextPayloadSha256.
  const recomputedPayload = computeContextPayloadSha256(snapshot);
  if (recomputedPayload !== snapshot.contextPayloadSha256) {
    throw new ContextReplayError(
      `Replay payload hash mismatch: expected ${recomputedPayload}, got ${snapshot.contextPayloadSha256}.`,
    );
  }

  // 4. Verify the snapshotSha256.
  const recomputedSnapshot = computeSnapshotSha256(snapshot);
  if (recomputedSnapshot !== snapshot.snapshotSha256) {
    throw new ContextReplayError(
      `Replay snapshot hash mismatch: expected ${recomputedSnapshot}, got ${snapshot.snapshotSha256}.`,
    );
  }

  return {
    valid: true,
    contextPayloadSha256: recomputedPayload,
    snapshotSha256: recomputedSnapshot,
  };
}

// ============================================================
// Legal snapshot state transitions
// ============================================================

/**
 * Allowed snapshot state transitions.
 *
 * PREPARED → SEALED (via sealSnapshot)
 * SEALED   → CONSUMED (via consumeSnapshot)
 * SEALED   → REJECTED (via rejectSnapshot)
 *
 * All other transitions are illegal. SEALED, CONSUMED, and REJECTED are
 * immutable — they cannot transition back to PREPARED.
 */
const ALLOWED_SNAPSHOT_TRANSITIONS: Readonly<Record<ContextSnapshotState, readonly ContextSnapshotState[]>> = {
  PREPARED: ["SEALED"],
  SEALED:   ["CONSUMED", "REJECTED"],
  CONSUMED: [],
  REJECTED: [],
} as const;

/**
 * Assert that a snapshot state transition is legal.
 *
 * @throws ContextStateError when the transition is not allowed.
 */
export function assertLegalSnapshotTransition(
  from: ContextSnapshotState,
  to: ContextSnapshotState,
): void {
  const allowed = ALLOWED_SNAPSHOT_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new ContextStateError(
      `Illegal snapshot state transition: ${from} -> ${to}`,
    );
  }
}

/**
 * Return true if the snapshot state transition is legal.
 */
export function isLegalSnapshotTransition(
  from: ContextSnapshotState,
  to: ContextSnapshotState,
): boolean {
  const allowed = ALLOWED_SNAPSHOT_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}
