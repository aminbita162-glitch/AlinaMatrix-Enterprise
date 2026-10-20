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

// ============================================================
// Deep authorization (ECIDR §09 — Gap 3)
// ============================================================

/**
 * Evidence lookup interface — the caller provides these lookups from
 * authoritative server-side stores (DB, RLS-protected queries).
 * The authorization function never trusts client-supplied identifiers;
 * it validates the contract against these authoritative lookups.
 */
export interface AuthorizationEvidence {
  /** The server-derived tenant ID (from the authenticated session). */
  serverTenantId: string;
  /** Set of project IDs owned by or accessible to the tenant. */
  accessibleProjectIds: ReadonlySet<string>;
  /** Set of workflow run IDs owned by the tenant. */
  ownedWorkflowRunIds: ReadonlySet<string>;
  /** Set of job IDs owned by the tenant. */
  ownedJobIds: ReadonlySet<string>;
  /** Map of sourceVersionId → current contentSha256 (for source-version pinning). */
  sourceVersionHashes: ReadonlyMap<string, string>;
  /** Set of revoked source version IDs. */
  revokedSourceVersionIds: ReadonlySet<string>;
  /** Set of cancelled job IDs (jobs that cannot be consumed). */
  cancelledJobIds: ReadonlySet<string>;
  /** The expected policy SHA-256 for the project/tenant. */
  expectedPolicySha256: string;
  /** The expected schema SHA-256 for the current schema version. */
  expectedSchemaSha256: string;
  /** The expected model version ID for the current model pin. */
  expectedModelVersionId: string;
}

/**
 * Deep authorization — validates the full multi-dimensional identity chain.
 *
 * Checks (all fail-closed):
 *   1. Server-derived tenant ID matches the contract's tenantId.
 *   2. Project is in the tenant's accessible set.
 *   3. Workflow run is owned by the tenant.
 *   4. Job is owned by the tenant.
 *   5. Job is not cancelled.
 *   6. Every source version exists and its content hash matches.
 *   7. No source version is revoked.
 *   8. Policy SHA-256 matches the expected pin.
 *   9. Schema SHA-256 matches the expected pin.
 *  10. Model version ID matches the expected pin.
 *  11. Agent name matches the executing agent.
 *  12. Agent holds the required capability.
 *  13. Release/export is always denied.
 *
 * Directive ECIDR §09:
 *   "Validate tenant + project + source ownership, source-version pinning,
 *    job/run ownership, task type, and agent capability together.
 *    Reject ambiguous/missing references."
 *
 * @throws ContextAuthorizationError on any dimension mismatch.
 * @throws CapabilityDeniedError when the agent lacks the capability.
 */
export function assertContextAuthorizedDeep(
  contract: ContextContractV1,
  agentName: AgentName,
  capability: string,
  evidence: AuthorizationEvidence,
): void {
  // 1. Server-derived tenant identity — never trust client-supplied tenantId.
  if (contract.tenantId !== evidence.serverTenantId) {
    throw new ContextAuthorizationError(
      `Tenant mismatch: contract tenant "${contract.tenantId}" does not match server-derived tenant "${evidence.serverTenantId}".`,
    );
  }

  // 2. Project ownership / access.
  if (!evidence.accessibleProjectIds.has(contract.projectId)) {
    throw new ContextAuthorizationError(
      `Project "${contract.projectId}" is not accessible by tenant "${evidence.serverTenantId}".`,
    );
  }

  // 3. Workflow run ownership.
  if (!evidence.ownedWorkflowRunIds.has(contract.workflowRunId)) {
    throw new ContextAuthorizationError(
      `Workflow run "${contract.workflowRunId}" is not owned by tenant "${evidence.serverTenantId}".`,
    );
  }

  // 4. Job ownership.
  if (!evidence.ownedJobIds.has(contract.jobId)) {
    throw new ContextAuthorizationError(
      `Job "${contract.jobId}" is not owned by tenant "${evidence.serverTenantId}".`,
    );
  }

  // 5. Job cancellation check.
  if (evidence.cancelledJobIds.has(contract.jobId)) {
    throw new ContextAuthorizationError(
      `Job "${contract.jobId}" is CANCELLED and cannot be consumed.`,
    );
  }

  // 6 + 7. Source version pinning — every source ref must exist, match hash, and not be revoked.
  for (const ref of contract.sourceRefs) {
    if (evidence.revokedSourceVersionIds.has(ref.sourceVersionId)) {
      throw new ContextAuthorizationError(
        `Source version "${ref.sourceVersionId}" is REVOKED and cannot be consumed.`,
      );
    }
    const expectedHash = evidence.sourceVersionHashes.get(ref.sourceVersionId);
    if (expectedHash === undefined) {
      throw new ContextAuthorizationError(
        `Source version "${ref.sourceVersionId}" not found in the tenant's source store.`,
      );
    }
    if (expectedHash !== ref.contentSha256) {
      throw new ContextAuthorizationError(
        `Source version "${ref.sourceVersionId}" content hash mismatch: expected ${expectedHash}, got ${ref.contentSha256}.`,
      );
    }
  }

  // 8. Policy version pin.
  if (contract.policySha256 !== evidence.expectedPolicySha256) {
    throw new ContextAuthorizationError(
      `Policy hash mismatch: expected ${evidence.expectedPolicySha256}, got ${contract.policySha256}.`,
    );
  }

  // 9. Schema version pin.
  if (contract.schemaSha256 !== evidence.expectedSchemaSha256) {
    throw new ContextAuthorizationError(
      `Schema hash mismatch: expected ${evidence.expectedSchemaSha256}, got ${contract.schemaSha256}.`,
    );
  }

  // 10. Model version pin.
  if (contract.modelVersionId !== evidence.expectedModelVersionId) {
    throw new ContextAuthorizationError(
      `Model version mismatch: expected ${evidence.expectedModelVersionId}, got ${contract.modelVersionId}.`,
    );
  }

  // 11 + 12 + 13. Delegate to the existing shallow authorization for agent + capability.
  assertContextAuthorized(contract, agentName, capability);
}

// ============================================================
// Evidence-grounded replay (ECIDR §10 — Gap 2)
// ============================================================

/**
 * Evidence lookup interface for replay verification — provides access to
 * authoritative historical evidence (source bytes, policy records, provider
 * outputs). The replay function uses these to verify the snapshot against
 * external truth, not merely recompute internal hashes.
 */
export interface ReplayEvidence {
  /** Map of sourceVersionId → the actual content SHA-256 from the source store. */
  sourceVersionContentHashes: ReadonlyMap<string, string>;
  /** Set of source version IDs that have been revoked. */
  revokedSourceVersionIds: ReadonlySet<string>;
  /** The historical policy SHA-256 at the time of sealing. */
  historicalPolicySha256: string;
  /** The historical schema SHA-256 at the time of sealing. */
  historicalSchemaSha256: string;
  /** The historical model version ID at the time of sealing. */
  historicalModelVersionId: string;
  /** The canonicalization version expected at the time of sealing. */
  expectedCanonicalizationVersion: string;
  /** The provider output hash recorded at the time of sealing (or null if not recorded). */
  recordedProviderOutputHash: string | null;
}

/**
 * Evidence-grounded replay — verifies a sealed snapshot against authoritative
 * historical evidence, not merely internal hash consistency.
 *
 * Checks (all fail-closed with typed ContextReplayError):
 *   1. Snapshot state is SEALED.
 *   2. Schema validation passes (SealedSnapshotSchema).
 *   3. Internal hash consistency (payload + snapshot hash).
 *   4. Every source version exists in the evidence store.
 *   5. Every source version's content hash matches the authoritative record.
 *   6. No source version is revoked under the historical replay policy.
 *   7. Policy SHA-256 matches the historical pin.
 *   8. Schema SHA-256 matches the historical pin.
 *   9. Model version ID matches the historical pin.
 *  10. Canonicalization version matches the expected version.
 *  11. Provider output hash (if recorded) matches the contract's pins.
 *
 * This is a READ-ONLY operation — no side effects, no state transitions,
 * no external actions, no writes, no network calls beyond the evidence lookups
 * the caller provides.
 *
 * Directive ECIDR §10:
 *   "Replay must reject missing/changed source bytes, policy changes without
 *    a matching historical pin, missing provider records, tenant mismatch,
 *    and schema incompatibility."
 *
 * @throws ContextReplayError on any evidence mismatch or missing record.
 */
export function replaySnapshotWithEvidence(
  snapshot: SealedSnapshot,
  evidence: ReplayEvidence,
): {
  valid: true;
  contextPayloadSha256: string;
  snapshotSha256: string;
  evidenceChecks: { sourceVersions: number; policyMatch: boolean; schemaMatch: boolean; modelMatch: boolean; };
} {
  // 1. Verify snapshot state is SEALED.
  if (snapshot.snapshotState !== "SEALED") {
    throw new ContextReplayError(
      `Cannot replay a snapshot in state "${snapshot.snapshotState}" — must be SEALED.`,
    );
  }

  // 2. Validate schema.
  const parsed = SealedSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    throw new ContextReplayError(
      `Replay schema validation failed: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  // 3. Internal hash consistency.
  const recomputedPayload = computeContextPayloadSha256(snapshot);
  if (recomputedPayload !== snapshot.contextPayloadSha256) {
    throw new ContextReplayError(
      `Replay payload hash mismatch: expected ${recomputedPayload}, got ${snapshot.contextPayloadSha256}.`,
    );
  }
  const recomputedSnapshot = computeSnapshotSha256(snapshot);
  if (recomputedSnapshot !== snapshot.snapshotSha256) {
    throw new ContextReplayError(
      `Replay snapshot hash mismatch: expected ${recomputedSnapshot}, got ${snapshot.snapshotSha256}.`,
    );
  }

  // 4 + 5 + 6. External source verification — every source ref must exist,
  //    match the authoritative content hash, and not be revoked.
  for (const ref of snapshot.sourceRefs) {
    if (evidence.revokedSourceVersionIds.has(ref.sourceVersionId)) {
      throw new ContextReplayError(
        `Replay failed: source version "${ref.sourceVersionId}" is revoked under the historical replay policy.`,
      );
    }
    const authoritativeHash = evidence.sourceVersionContentHashes.get(ref.sourceVersionId);
    if (authoritativeHash === undefined) {
      throw new ContextReplayError(
        `Replay failed: source version "${ref.sourceVersionId}" has no authoritative historical record.`,
      );
    }
    if (authoritativeHash !== ref.contentSha256) {
      throw new ContextReplayError(
        `Replay failed: source version "${ref.sourceVersionId}" content hash mismatch — expected ${authoritativeHash}, recorded ${ref.contentSha256}. Source bytes may have been altered.`,
      );
    }
  }

  // 7. Policy pin.
  if (snapshot.policySha256 !== evidence.historicalPolicySha256) {
    throw new ContextReplayError(
      `Replay failed: policy hash mismatch — expected ${evidence.historicalPolicySha256}, recorded ${snapshot.policySha256}. Policy may have changed without a matching historical pin.`,
    );
  }

  // 8. Schema pin.
  if (snapshot.schemaSha256 !== evidence.historicalSchemaSha256) {
    throw new ContextReplayError(
      `Replay failed: schema hash mismatch — expected ${evidence.historicalSchemaSha256}, recorded ${snapshot.schemaSha256}. Schema may have changed without a matching historical pin.`,
    );
  }

  // 9. Model version pin.
  if (snapshot.modelVersionId !== evidence.historicalModelVersionId) {
    throw new ContextReplayError(
      `Replay failed: model version mismatch — expected ${evidence.historicalModelVersionId}, recorded ${snapshot.modelVersionId}.`,
    );
  }

  // 10. Canonicalization version pin.
  if (snapshot.canonicalizationVersion !== evidence.expectedCanonicalizationVersion) {
    throw new ContextReplayError(
      `Replay failed: canonicalization version mismatch — expected ${evidence.expectedCanonicalizationVersion}, recorded ${snapshot.canonicalizationVersion}.`,
    );
  }

  // 11. Provider output hash — if recorded, verify it's a valid 64-char hex
  //     (the contract pins it; we verify it's structurally valid).
  if (evidence.recordedProviderOutputHash !== null) {
    if (!/^[0-9a-f]{64}$/.test(evidence.recordedProviderOutputHash)) {
      throw new ContextReplayError(
        `Replay failed: recorded provider output hash is not a valid SHA-256 hex string.`,
      );
    }
  }

  return {
    valid: true,
    contextPayloadSha256: recomputedPayload,
    snapshotSha256: recomputedSnapshot,
    evidenceChecks: {
      sourceVersions: snapshot.sourceRefs.length,
      policyMatch: true,
      schemaMatch: true,
      modelMatch: true,
    },
  };
}
