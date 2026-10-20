/**
 * Context Contract V1 — ECIDR (Verifiable Evidence Context Integrity & Deterministic Replay).
 *
 * Zod schemas for the strict runtime-validated, versioned context contract that
 * binds every evidence context handoff to an authenticated server-derived tenant,
 * an authorized project, a workflow run, a job, a named agent, a task purpose,
 * a policy version, and an immutable set of source versions.
 *
 * Directive ECIDR §05:
 *   "Define one strict runtime-validated, versioned contract using existing
 *    @alinamatrix/contracts conventions."
 *
 * Directive ECIDR §06:
 *   "Domain-separated SHA-256 over UTF-8 canonical serialization with explicit
 *    schema/canonicalization versions; stable key ordering, normalized types,
 *    unambiguous delimiters, deterministic array treatment."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

// ============================================================
// Primitives (existing conventions)
// ============================================================

const UuidString  = z.string().uuid();
const Sha256Hex   = z.string().length(64).regex(/^[0-9a-f]{64}$/);
const IsoUtc      = z.string().datetime();
const NonEmpty    = z.string().min(1);

// ============================================================
// Source reference (a pinned source version + its content hash + evidence fragments)
// ============================================================

/**
 * A reference to a pinned source version consumed by the context.
 *
 * Each source reference carries:
 *   - sourceVersionId: the UUID of the immutable source version.
 *   - contentSha256: the SHA-256 of that version's content bytes.
 *   - evidenceFragmentRefs[]: the evidence fragment IDs (UUIDs) consumed.
 *
 * Directive ECIDR §05:
 *   "sourceRefs[] of {sourceVersionId, contentSha256, evidenceFragmentRefs[]}"
 *
 * Source references must be sorted and deduplicated in a documented canonical
 * order (by sourceVersionId, ascending UUID string sort) before hashing.
 */
export const SourceRefSchema = z.object({
  sourceVersionId:      UuidString,
  contentSha256:        Sha256Hex,
  evidenceFragmentRefs: z.array(UuidString).min(0).max(1024),
}).strict();
export type SourceRef = z.infer<typeof SourceRefSchema>;

// ============================================================
// Context snapshot lifecycle states
// ============================================================

/**
 * The lifecycle of a context snapshot.
 *
 * Directive ECIDR §07:
 *   "State model: PREPARED -> SEALED -> CONSUMED (or REJECTED)"
 *
 * - PREPARED: the snapshot has been assembled but not yet sealed. It may only
 *   reference authorized, current, pinned source versions.
 * - SEALED: the snapshot's hashes and pins have been verified in one
 *   consistent transactional view. SEALED content is immutable.
 * - CONSUMED: the snapshot was consumed by an agent/job. Records which agent
 *   consumed which sealed snapshot.
 * - REJECTED: the snapshot was rejected with a safe reason code.
 */
export const ContextSnapshotStateSchema = z.enum([
  "PREPARED",
  "SEALED",
  "CONSUMED",
  "REJECTED",
]);
export type ContextSnapshotState = z.infer<typeof ContextSnapshotStateSchema>;

// ============================================================
// Context snapshot reason codes (for REJECTED state)
// ============================================================

export const ContextRejectReasonSchema = z.enum([
  "HASH_MISMATCH",
  "SOURCE_NOT_FOUND",
  "SOURCE_REVOKED",
  "POLICY_MISMATCH",
  "INVALID_STATE",
  "CANCELLATION",
  "TENANT_MISMATCH",
  "UNAUTHORIZED_CAPABILITY",
  "SCHEMA_INCOMPATIBILITY",
]);
export type ContextRejectReason = z.infer<typeof ContextRejectReasonSchema>;

// ============================================================
// Context Contract V1 — the full logical schema
// ============================================================

/**
 * The strict runtime-validated, versioned context contract.
 *
 * Every context handoff to an existing agent must be bound to:
 *   - an authenticated server-derived tenant (tenantId),
 *   - an authorized project (projectId),
 *   - a workflow run (workflowRunId),
 *   - a job (jobId),
 *   - a named agent (agentName — one of the four frozen agents),
 *   - a task purpose (taskKind),
 *   - a policy version (policySha256),
 *   - an immutable set of source versions (sourceRefs[]),
 *   - prompt/schema/model/agent version pins (promptSha256, schemaSha256,
 *     modelVersionId, agentVersionId),
 *   - a deterministic canonicalization version (canonicalizationVersion),
 *   - a context payload hash (contextPayloadSha256 — over the canonical
 *     serialization of the deterministic fields),
 *   - a snapshot hash (snapshotSha256 — over the full sealed snapshot including
 *     the payload hash),
 *   - an authorization decision id (authorizationDecisionId — the existing
 *     audit reference),
 *   - a created-at timestamp (audit metadata; excluded from content determinism).
 *
 * Directive ECIDR §05:
 *   "contractVersion='1'; ... Distinguish metadata timestamps from
 *    deterministic input hashes."
 *
 * Determinism:
 *   - contextPayloadSha256 is the hash over the canonical JSON of all
 *     deterministic fields (excluding createdAt, which is audit metadata).
 *   - snapshotSha256 is the hash over the canonical JSON of the full sealed
 *     snapshot (including contextPayloadSha256 but excluding createdAt).
 *   - Source references are sorted by sourceVersionId before hashing.
 */
/**
 * The shape of the ContextContractV1 schema — extracted so that
 * SealedSnapshotSchema and ConsumedSnapshotSchema can extend it without
 * the `.strict()` inheritance issue in Zod v4.
 */
const ContextContractV1Shape = {
  /** The contract version — fixed to "1" for this schema. */
  contractVersion:         z.literal("1"),

  /** Server-derived tenant ID. Never from client input. */
  tenantId:                 UuidString,
  /** Authorized project ID. */
  projectId:                UuidString,
  /** Workflow run ID. */
  workflowRunId:            UuidString,
  /** Job ID. */
  jobId:                    UuidString,

  /** Named agent — one of the four frozen agents. */
  agentName:                z.enum([
    "AlinaArchitect",
    "AlinaGuard",
    "AlinaDocEngine",
    "AlinaOptimizer",
  ]),

  /** Task purpose (e.g. "architect_plan", "guard_validate"). */
  taskKind:                 NonEmpty.max(256),

  /** Immutable source references — sorted + deduplicated by sourceVersionId. */
  sourceRefs:               z.array(SourceRefSchema).min(1).max(256),

  /** SHA-256 of the rendered prompt content. */
  promptSha256:             Sha256Hex,
  /** SHA-256 of the output schema. */
  schemaSha256:             Sha256Hex,
  /** SHA-256 of the policy rules JSON. */
  policySha256:             Sha256Hex,

  /** Model version ID (existing canonical model pin). */
  modelVersionId:           UuidString,
  /** Agent version ID (where available; may be the same as the agent's row id). */
  agentVersionId:           UuidString,

  /** Deterministic canonicalization version (e.g. "canonical-json-v1"). */
  canonicalizationVersion:  NonEmpty.max(64),

  /** SHA-256 over the canonical serialization of the deterministic fields. */
  contextPayloadSha256:     Sha256Hex,
  /** SHA-256 over the full sealed snapshot (including the payload hash). */
  snapshotSha256:           Sha256Hex,

  /**
   * Audit metadata — the timestamp the snapshot was created.
   * Excluded from content determinism (does not alter the contextPayloadSha256).
   */
  createdAt:                IsoUtc,

  /**
   * Authorization decision ID — the existing audit reference for the
   * authorization decision that approved this context.
   */
  authorizationDecisionId:  UuidString,
};

export const ContextContractV1Schema = z.object(ContextContractV1Shape).strict();
export type ContextContractV1 = z.infer<typeof ContextContractV1Schema>;

// ============================================================
// Sealed snapshot (the immutable record of a SEALED context)
// ============================================================

/**
 * A sealed context snapshot — the immutable record after SEAL.
 *
 * Directive ECIDR §07:
 *   "SEALED content is immutable; changes create a new snapshot with a new
 *    digest and linkage to predecessor, never overwrite historical bytes."
 *
 * The sealed snapshot carries the contract fields plus:
 *   - snapshotState: "SEALED"
 *   - sealedAt: the timestamp the snapshot was sealed (audit metadata)
 *   - predecessorSnapshotId: the UUID of the predecessor snapshot (or null for
 *     the first snapshot)
 */
export const SealedSnapshotSchema = z.object({
  ...ContextContractV1Shape,
  snapshotState:            z.literal("SEALED"),
  sealedAt:                 IsoUtc,
  predecessorSnapshotId:    UuidString.nullable(),
}).strict();
export type SealedSnapshot = z.infer<typeof SealedSnapshotSchema>;

// ============================================================
// Consumed snapshot (records which agent/job consumed which sealed snapshot)
// ============================================================

/**
 * A consumed context snapshot — records which agent/job consumed which sealed
 * snapshot.
 *
 * Directive ECIDR §07:
 *   "CONSUMED records which agent/job consumed which sealed snapshot."
 */
export const ConsumedSnapshotSchema = z.object({
  ...ContextContractV1Shape,
  snapshotState:            z.literal("CONSUMED"),
  sealedAt:                 IsoUtc,
  predecessorSnapshotId:    UuidString.nullable(),
  consumedAt:               IsoUtc,
  consumedByJobId:          UuidString,
}).strict();
export type ConsumedSnapshot = z.infer<typeof ConsumedSnapshotSchema>;

// ============================================================
// Rejected snapshot (records a safe reason code)
// ============================================================

/**
 * A rejected context snapshot — records a safe reason code.
 *
 * Directive ECIDR §07:
 *   "REJECTED records a safe reason code."
 */
export const RejectedSnapshotSchema = z.object({
  ...ContextContractV1Shape,
  snapshotState:            z.literal("REJECTED"),
  sealedAt:                 IsoUtc,
  predecessorSnapshotId:    UuidString.nullable(),
  rejectedAt:               IsoUtc,
  rejectReason:             ContextRejectReasonSchema,
}).strict();
export type RejectedSnapshot = z.infer<typeof RejectedSnapshotSchema>;

// ============================================================
// Union of all snapshot states
// ============================================================

export const ContextSnapshotSchema = z.discriminatedUnion("snapshotState", [
  SealedSnapshotSchema,
  ConsumedSnapshotSchema,
  RejectedSnapshotSchema,
]);
export type ContextSnapshot = z.infer<typeof ContextSnapshotSchema>;
