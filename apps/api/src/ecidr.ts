/**
 * ECIDR runtime integration — wires the Context Contract V1 lifecycle into
 * the four-agent execution boundaries.
 *
 * This module is the integration layer between the API router's
 * authenticated session and the domain-layer agent functions:
 *   - AlinaArchitect (runArchitectPlan)
 *   - AlinaGuard (runGuard)
 *   - AlinaDocEngine (renderBeachhead)
 *   - AlinaOptimizer (cache metadata — WRITE_CACHE_METADATA)
 *
 * For every agent execution, this module:
 *   1. Derives tenant identity from the authenticated server-side session
 *      (never from untrusted client request fields).
 *   2. Builds a ContextContractV1 binding project, run, job, agent, task,
 *      source versions, and policy/schema/model pins.
 *   3. Computes the canonical payload hash and snapshot hash.
 *   4. Enforces deep authorization (assertContextAuthorizedDeep) before
 *      materializing or consuming the evidence context.
 *   5. Seals the snapshot (sealSnapshot).
 *   6. Records consumption against the authorized agent/job.
 *   7. Rejects invalid, stale, revoked, mismatched, or unauthorized context.
 *
 * Directive ECIDR §04:
 *   "The feature must be integrated at real context-consumption boundaries,
 *    not merely a helper unused by agents."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { createHash } from "node:crypto";
import {
  CANONICALIZATION_VERSION,
  computeContextPayloadSha256,
  computeSnapshotSha256,
  assertContextAuthorizedDeep,
  sealSnapshot,
  consumeSnapshot,
  rejectSnapshot,
  type AgentName,
  type AuthorizationEvidence,
  type ContextRejectReason,
} from "@alinamatrix/domain";
import {
  ContextContractV1Schema,
  type ContextContractV1,
  type SealedSnapshot,
  type SourceRef,
} from "@alinamatrix/contracts";

// ============================================================
// Types
// ============================================================

/**
 * The input to build a context contract for an agent execution.
 * Tenant identity is always server-derived; projectId and workflowRunId
 * are loaded from the DB by the caller (not trusted from the client).
 */
export interface AgentExecutionContextInput {
  /** Server-derived tenant ID (from the authenticated session). */
  tenantId: string;
  /** Project ID (loaded from the DB, RLS-verified). */
  projectId: string;
  /** Workflow run ID (loaded from the DB, RLS-verified). */
  workflowRunId: string;
  /** Job ID (loaded from the DB, RLS-verified). */
  jobId: string;
  /** The named agent that will consume this context. */
  agentName: AgentName;
  /** The task purpose (e.g. "architect_plan", "guard_validate"). */
  taskKind: string;
  /** Source version references — pinned immutable source versions. */
  sourceRefs: SourceRef[];
  /** SHA-256 of the rendered prompt content. */
  promptSha256: string;
  /** SHA-256 of the output schema. */
  schemaSha256: string;
  /** SHA-256 of the policy rules JSON. */
  policySha256: string;
  /** Model version ID (UUID). */
  modelVersionId: string;
  /** Agent version ID (UUID). */
  agentVersionId: string;
  /** Authorization decision ID (UUID — the audit reference). */
  authorizationDecisionId: string;
}

/**
 * The sealed execution result — the sealed snapshot plus the authorized
 * context for the agent to consume.
 */
export interface SealedExecutionContext {
  /** The sealed context snapshot. */
  sealed: SealedSnapshot;
  /** The authorized context contract. */
  contract: ContextContractV1;
}

/**
 * The consumed execution result — the consumed snapshot recording which
 * agent/job consumed which sealed snapshot.
 */
export interface ConsumedExecutionContext {
  /** The consumed context snapshot. */
  consumed: ReturnType<typeof consumeSnapshot>;
  /** The sealed snapshot that was consumed. */
  sealed: SealedSnapshot;
}

// ============================================================
// Context contract builder
// ============================================================

/**
 * Build a ContextContractV1 from the execution input.
 *
 * The contract is the logical schema that binds every evidence context
 * handoff to an authenticated tenant, project, run, job, agent, task,
 * source versions, and policy/schema/model pins.
 *
 * The contextPayloadSha256 and snapshotSha256 are computed by the domain
 * layer (deterministic, domain-separated SHA-256).
 */
export function buildContextContract(
  input: AgentExecutionContextInput,
  createdAt: string,
): ContextContractV1 {
  const contract: ContextContractV1 = {
    contractVersion: "1",
    tenantId: input.tenantId,
    projectId: input.projectId,
    workflowRunId: input.workflowRunId,
    jobId: input.jobId,
    agentName: input.agentName,
    taskKind: input.taskKind,
    sourceRefs: input.sourceRefs,
    promptSha256: input.promptSha256,
    schemaSha256: input.schemaSha256,
    policySha256: input.policySha256,
    modelVersionId: input.modelVersionId,
    agentVersionId: input.agentVersionId,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    contextPayloadSha256: "0".repeat(64), // placeholder — computed below
    snapshotSha256: "0".repeat(64), // placeholder — computed below
    createdAt,
    authorizationDecisionId: input.authorizationDecisionId,
  };

  // Compute the payload hash (over all deterministic fields, excluding
  // the payload hash and snapshot hash themselves).
  contract.contextPayloadSha256 = computeContextPayloadSha256(contract);
  // Compute the snapshot hash (over the full snapshot including the
  // payload hash, excluding the snapshot hash itself).
  contract.snapshotSha256 = computeSnapshotSha256(contract);

  // Validate the contract against the strict Zod schema.
  const parsed = ContextContractV1Schema.safeParse(contract);
  if (!parsed.success) {
    throw new Error(
      `Context contract validation failed: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  return parsed.data;
}

// ============================================================
// Seal + authorize — the execution boundary enforcement
// ============================================================

/**
 * Seal a context snapshot for an agent execution, enforcing deep authorization
 * against server-side evidence before the snapshot is sealed.
 *
 * This is the primary ECIDR enforcement point: every agent context handoff
 * must pass through this function. It:
 *   1. Validates the contract schema.
 *   2. Enforces deep authorization (tenant, project, job, source, policy,
 *      schema, model, agent, capability).
 *   3. Verifies internal hash consistency (payload + snapshot hash).
 *   4. Seals the snapshot (PREPARED → SEALED).
 *
 * Directive ECIDR §04:
 *   "Every context handoff to an existing agent must be bound to an
 *    authenticated server-derived tenant, authorized project, workflow
 *    run, job, named agent, task purpose, policy version, and an
 *    immutable set of source versions."
 *
 * @throws ContextAuthorizationError on any authorization dimension mismatch.
 * @throws ContextHashMismatchError on internal hash inconsistency.
 * @throws CapabilityDeniedError when the agent lacks the capability.
 */
export function sealExecutionContext(
  input: AgentExecutionContextInput,
  sealedAt: string,
  capability: string,
  evidence: AuthorizationEvidence,
): SealedExecutionContext {
  // Build the contract with computed hashes.
  const contract = buildContextContract(input, sealedAt);

  // Enforce deep authorization — validates the full identity chain
  // against server-side evidence (tenant, project, job, source, policy,
  // schema, model, agent, capability). Fail-closed on any mismatch.
  assertContextAuthorizedDeep(contract, input.agentName, capability, evidence);

  // Seal the snapshot — verifies internal hash consistency and returns
  // the immutable SEALED record.
  const sealed = sealSnapshot({
    contract,
    sealedAt,
    predecessorSnapshotId: null,
    agentName: input.agentName,
    capability,
  });

  return { sealed, contract };
}

/**
 * Consume a sealed execution context — records which agent/job consumed
 * which sealed snapshot. Must be called after the agent has completed its
 * work (or before, depending on the workflow semantics).
 *
 * @throws ContextStateError when the snapshot is not SEALED.
 * @throws ContextAuthorizationError when the agent is not authorized.
 */
export function consumeExecutionContext(
  sealed: SealedSnapshot,
  consumedAt: string,
  consumedByJobId: string,
  agentName: AgentName,
  capability: string,
): ConsumedExecutionContext {
  const consumed = consumeSnapshot(
    sealed,
    consumedAt,
    consumedByJobId,
    agentName,
    capability,
  );
  return { consumed, sealed };
}

/**
 * Reject a sealed execution context — records a safe reason code.
 *
 * @throws ContextStateError when the snapshot is not SEALED.
 */
export function rejectExecutionContext(
  sealed: SealedSnapshot,
  rejectedAt: string,
  reason: ContextRejectReason,
): ReturnType<typeof rejectSnapshot> {
  return rejectSnapshot(sealed, rejectedAt, reason);
}

// ============================================================
// Per-agent execution boundary helpers
// ============================================================

/**
 * The capability required for each agent's primary task.
 * Maps the four agents to their ECIDR-enforced capability.
 */
export const AGENT_TASK_CAPABILITIES: Readonly<Record<AgentName, string>> = {
  AlinaArchitect: "WRITE_DRAFT",
  AlinaGuard: "RUN_VALIDATION",
  AlinaDocEngine: "COMPILE_ARTIFACT",
  AlinaOptimizer: "WRITE_CACHE_METADATA",
} as const;

/**
 * The task kind for each agent's primary execution.
 */
export const AGENT_TASK_KINDS: Readonly<Record<AgentName, string>> = {
  AlinaArchitect: "architect_plan",
  AlinaGuard: "guard_validate",
  AlinaDocEngine: "doc_compile",
  AlinaOptimizer: "cache_metadata",
} as const;

/**
 * Derive the prompt SHA-256 for an agent execution from the canonical
 * source version IDs and the agent's task kind.
 */
export function derivePromptSha256(
  sourceVersionIds: string[],
  taskKind: string,
): string {
  const sorted = [...sourceVersionIds].sort().join(",");
  return createHash("sha256")
    .update(`prompt:${taskKind}:${sorted}`, "utf8")
    .digest("hex");
}

/**
 * Verify that the context contract's agent name matches the expected agent
 * for the task kind, and that the capability is appropriate.
 *
 * This is a convenience guard for the API router to verify the agent-task
 * binding before calling the domain agent function.
 */
export function assertAgentTaskBinding(
  agentName: AgentName,
  taskKind: string,
): void {
  const expectedKind = AGENT_TASK_KINDS[agentName];
  if (taskKind !== expectedKind) {
    throw new Error(
      `Agent-task binding mismatch: agent "${agentName}" expects task kind "${expectedKind}", got "${taskKind}".`,
    );
  }
}
