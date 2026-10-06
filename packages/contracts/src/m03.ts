/**
 * M03 Content Model — Zod schemas.
 *
 * Covers all sections of the M03 Architecture Decision Record content model
 * as specified in DIRECTIV.txt Phase 6:
 *   Metadata, Context, Decision, Status, Drivers, Options, Outcome,
 *   Consequences, Evidence map, Claim atoms, Assumptions, Negative evidence,
 *   Terminology, Risks, Open questions, Review, Approval, Limitations,
 *   Release metadata.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

// ============================================================
// Shared primitives
// ============================================================

const NonEmptyString = z.string().min(1).max(4096);
const ShortString    = z.string().min(1).max(512);
const UuidString     = z.string().uuid();

// ============================================================
// Metadata
// ============================================================

export const M03MetadataSchema = z.object({
  /** Unique document ID (UUID, server-generated). */
  id:               UuidString,
  title:            ShortString,
  version:          z.number().int().positive(),
  projectId:        UuidString,
  tenantId:         UuidString,
  workflowRunId:    UuidString,
  /** ISO-8601 UTC creation timestamp. */
  createdAt:        z.string().datetime(),
  /** Free-text document type identifier — "M03" for beachhead. */
  documentType:     z.literal("M03"),
  /** Exact product sentence per DIRECTIV.txt FROZEN DECISIONS. */
  productSentence:  z.literal("Turn complex evidence into auditable professional artifacts."),
  /** Exact status line per H02. */
  statusLine:       z.literal("Enterprise Candidate  -  Active Development"),
});
export type M03Metadata = z.infer<typeof M03MetadataSchema>;

// ============================================================
// Context
// ============================================================

export const M03ContextSchema = z.object({
  background:    NonEmptyString,
  problemStatement: NonEmptyString,
  scope:         z.string().max(4096).optional(),
});
export type M03Context = z.infer<typeof M03ContextSchema>;

// ============================================================
// Decision
// ============================================================

export const M03DecisionSchema = z.object({
  decisionStatement: NonEmptyString,
  decisionOwner:     ShortString,
  /** ISO-8601 date string (date only, UTC). */
  decisionDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type M03Decision = z.infer<typeof M03DecisionSchema>;

// ============================================================
// Status
// ============================================================

export const M03StatusValueSchema = z.enum([
  "proposed",
  "accepted",
  "deprecated",
  "superseded",
]);
export type M03StatusValue = z.infer<typeof M03StatusValueSchema>;

export const M03StatusSchema = z.object({
  value:   M03StatusValueSchema,
  context: z.string().max(2048).optional(),
});
export type M03Status = z.infer<typeof M03StatusSchema>;

// ============================================================
// Drivers
// ============================================================

export const M03DriverSchema = z.object({
  id:          ShortString,
  description: NonEmptyString,
  type:        z.enum(["constraint", "concern", "goal", "risk"]),
});
export type M03Driver = z.infer<typeof M03DriverSchema>;

// ============================================================
// Options considered
// ============================================================

export const M03OptionSchema = z.object({
  id:          ShortString,
  title:       ShortString,
  description: NonEmptyString,
  pros:        z.array(NonEmptyString).default([]),
  cons:        z.array(NonEmptyString).default([]),
});
export type M03Option = z.infer<typeof M03OptionSchema>;

// ============================================================
// Outcome
// ============================================================

export const M03OutcomeSchema = z.object({
  chosenOptionId: ShortString,
  rationale:      NonEmptyString,
});
export type M03Outcome = z.infer<typeof M03OutcomeSchema>;

// ============================================================
// Consequences
// ============================================================

export const M03ConsequenceSchema = z.object({
  description: NonEmptyString,
  type:        z.enum(["positive", "negative", "neutral"]),
});
export type M03Consequence = z.infer<typeof M03ConsequenceSchema>;

// ============================================================
// Evidence map entry
// ============================================================

export const M03EvidenceEntrySchema = z.object({
  /** References an existing source_fragment id. */
  fragmentId:        UuidString,
  sourceVersionId:   UuidString,
  relevanceNote:     NonEmptyString,
});
export type M03EvidenceEntry = z.infer<typeof M03EvidenceEntrySchema>;

// ============================================================
// Claim atom reference (references an existing claim id)
// ============================================================

export const M03ClaimRefSchema = z.object({
  /** Must be an existing claim ID — no invention. */
  claimId:       UuidString,
  role:          z.enum(["supports", "contradicts", "contextualizes"]),
  inlineNote:    z.string().max(2048).optional(),
});
export type M03ClaimRef = z.infer<typeof M03ClaimRefSchema>;

// ============================================================
// Assumption
// ============================================================

export const M03AssumptionSchema = z.object({
  id:          ShortString,
  statement:   NonEmptyString,
  risk:        NonEmptyString,
  owner:       ShortString,
});
export type M03Assumption = z.infer<typeof M03AssumptionSchema>;

// ============================================================
// Negative evidence
// ============================================================

export const M03NegativeEvidenceSchema = z.object({
  claimId:     UuidString,
  note:        NonEmptyString,
  resolvedBy:  z.string().max(2048).optional(),
});
export type M03NegativeEvidence = z.infer<typeof M03NegativeEvidenceSchema>;

// ============================================================
// Terminology entry
// ============================================================

export const M03TerminologyEntrySchema = z.object({
  term:       ShortString,
  definition: NonEmptyString,
  /** References an existing terminology_entries id in the project. */
  entryId:    UuidString,
});
export type M03TerminologyEntry = z.infer<typeof M03TerminologyEntrySchema>;

// ============================================================
// Risk
// ============================================================

export const M03RiskSchema = z.object({
  id:          ShortString,
  description: NonEmptyString,
  likelihood:  z.enum(["low", "medium", "high"]),
  impact:      z.enum(["low", "medium", "high"]),
  mitigation:  z.string().max(2048).optional(),
});
export type M03Risk = z.infer<typeof M03RiskSchema>;

// ============================================================
// Open question
// ============================================================

export const M03OpenQuestionSchema = z.object({
  id:          ShortString,
  question:    NonEmptyString,
  raisedBy:    ShortString,
  status:      z.enum(["open", "answered", "deferred"]),
  answer:      z.string().max(4096).optional(),
});
export type M03OpenQuestion = z.infer<typeof M03OpenQuestionSchema>;

// ============================================================
// Review
// ============================================================

export const M03ReviewSchema = z.object({
  reviewerId:   UuidString,
  reviewDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comments:     z.string().max(8192).optional(),
  /** Reviewer's recommendation (not a final approval). */
  recommendation: z.enum(["approve", "revise", "defer"]),
});
export type M03Review = z.infer<typeof M03ReviewSchema>;

// ============================================================
// Approval
// ============================================================

export const M03ApprovalSchema = z.object({
  approverId:   UuidString,
  approvalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  signature:    ShortString,
  /** Phase 7 four-eyes: approver must differ from author. Enforced in Phase 7. */
  authorId:     UuidString,
});
export type M03Approval = z.infer<typeof M03ApprovalSchema>;

// ============================================================
// Limitations
// ============================================================

export const M03LimitationSchema = z.object({
  description: NonEmptyString,
  /** Residual risk or open blocker category. */
  category:    z.enum(["scope", "data", "temporal", "technical", "regulatory", "other"]),
});
export type M03Limitation = z.infer<typeof M03LimitationSchema>;

// ============================================================
// Release metadata (populated in Phase 9; present but optional here)
// ============================================================

export const M03ReleaseMetadataSchema = z.object({
  releaseLabel:   z.string().max(128).optional(),
  releaseVersion: z.string().max(64).optional(),
  releasedAt:     z.string().datetime().optional(),
  artifactId:     UuidString.optional(),
  manifestId:     UuidString.optional(),
}).optional();
export type M03ReleaseMetadata = z.infer<typeof M03ReleaseMetadataSchema>;

// ============================================================
// Full M03 content model
// ============================================================

export const M03ContentModelSchema = z.object({
  metadata:          M03MetadataSchema,
  context:           M03ContextSchema,
  decision:          M03DecisionSchema,
  status:            M03StatusSchema,
  drivers:           z.array(M03DriverSchema).min(1),
  options:           z.array(M03OptionSchema).min(1),
  outcome:           M03OutcomeSchema,
  consequences:      z.array(M03ConsequenceSchema).default([]),
  evidenceMap:       z.array(M03EvidenceEntrySchema).default([]),
  claimAtoms:        z.array(M03ClaimRefSchema).default([]),
  assumptions:       z.array(M03AssumptionSchema).default([]),
  negativeEvidence:  z.array(M03NegativeEvidenceSchema).default([]),
  terminology:       z.array(M03TerminologyEntrySchema).default([]),
  risks:             z.array(M03RiskSchema).default([]),
  openQuestions:     z.array(M03OpenQuestionSchema).default([]),
  review:            z.array(M03ReviewSchema).default([]),
  approval:          z.array(M03ApprovalSchema).default([]),
  limitations:       z.array(M03LimitationSchema).min(1),
  releaseMetadata:   M03ReleaseMetadataSchema,
});
export type M03ContentModel = z.infer<typeof M03ContentModelSchema>;

// ============================================================
// Architect plan (the planning output before generate)
// ============================================================

export const M03ArchitectPlanSchema = z.object({
  planId:            UuidString,
  workflowRunId:     UuidString,
  projectId:         UuidString,
  tenantId:          UuidString,
  /** SHA-256 of canonical plan content — determinism proof. */
  planHash:          z.string().length(64),
  /** Abbreviated content structure: outlines what the generate step should produce. */
  sections:          z.array(z.object({
    sectionKey:  z.string(),
    instruction: z.string(),
  })).min(1),
  inputHash:         z.string().length(64),
  promptVersionId:   UuidString,
  schemaVersionId:   UuidString,
  policyVersionId:   UuidString,
  modelVersionId:    UuidString,
  createdAt:         z.string().datetime(),
});
export type M03ArchitectPlan = z.infer<typeof M03ArchitectPlanSchema>;

// ============================================================
// DB row shapes (for packages/db/src/m03.ts)
// ============================================================

export const M03PlanRowSchema = z.object({
  id:                UuidString,
  tenant_id:         UuidString,
  project_id:        UuidString,
  workflow_run_id:   UuidString,
  agent_version_id:  UuidString,
  prompt_version_id: UuidString,
  schema_version_id: UuidString,
  policy_version_id: UuidString,
  source_version_ids: z.array(UuidString),
  input_hash:        z.string().length(64),
  content_json:      z.record(z.string(), z.unknown()),
  plan_hash:         z.string().length(64),
  created_at:        z.date(),
});
export type M03PlanRow = z.infer<typeof M03PlanRowSchema>;

export const M03DraftRowSchema = z.object({
  id:                UuidString,
  tenant_id:         UuidString,
  project_id:        UuidString,
  workflow_run_id:   UuidString,
  plan_id:           UuidString,
  agent_version_id:  UuidString,
  prompt_version_id: UuidString,
  schema_version_id: UuidString,
  policy_version_id: UuidString,
  claim_ids:         z.array(UuidString),
  content_json:      z.record(z.string(), z.unknown()),
  draft_hash:        z.string().length(64),
  created_at:        z.date(),
});
export type M03DraftRow = z.infer<typeof M03DraftRowSchema>;
