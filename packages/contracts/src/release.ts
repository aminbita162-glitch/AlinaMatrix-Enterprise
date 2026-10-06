/**
 * Release contracts — Phase 9.
 *
 * Zod schemas for the release gate and labels:
 *   - ReleaseLabelSchema       — DRAFT, INTERNAL_REVIEW, APPROVED, PUBLISHED,
 *                                 ARCHIVED, REVOKED.
 *   - ReleaseGateInputSchema   — validations, critical findings, four-eyes,
 *                                 manifest, checksum, source versions, pins,
 *                                 source job state.
 *   - ReleaseGateResultSchema  — passed + reasons.
 *
 * Directive Phase 9:
 *   "Release function requires: validations pass, critical findings = 0,
 *    four-eyes approvals, manifest, checksum, source versions, version pins,
 *    source job not failed or cancelled."
 *   "Labels: DRAFT, INTERNAL_REVIEW, APPROVED, PUBLISHED, ARCHIVED, REVOKED."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

// ============================================================
// Release labels
// ============================================================

export const ReleaseLabelSchema = z.enum([
  "DRAFT",
  "INTERNAL_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "ARCHIVED",
  "REVOKED",
]);
export type ReleaseLabel = z.infer<typeof ReleaseLabelSchema>;

// ============================================================
// Release gate
// ============================================================

export const ReleaseGateInputSchema = z.object({
  /** True when all guard validations passed. */
  validationsPassed:     z.boolean(),
  /** Number of critical (error-level) findings from the guard. */
  criticalFindings:      z.number().int().min(0),
  /** True when at least one independent (non-author) approver approved. */
  fourEyesSatisfied:     z.boolean(),
  /** True when a build manifest is present. */
  manifestPresent:       z.boolean(),
  /** True when the HTML sha256 (checksum) is present. */
  checksumPresent:       z.boolean(),
  /** Source version ids referenced by the artifact. */
  sourceVersionIds:      z.array(z.string().uuid()),
  /** True when all version pins (prompt, model, schema, policy) are present. */
  versionPinsPresent:    z.boolean(),
  /** State of the source processing job. */
  sourceJobState:        z.enum([
    "INGESTED", "CLASSIFIED", "EXTRACTED", "EVIDENCE_READY",
    "ARCHITECTED", "GENERATED", "VALIDATING", "NEEDS_REVIEW",
    "APPROVED", "BUILDING", "BUILT", "RELEASED",
    "FAILED_RETRYABLE", "FAILED_TERMINAL", "CANCELLED", "EXPIRED", "QUARANTINED",
  ]),
});
export type ReleaseGateInput = z.infer<typeof ReleaseGateInputSchema>;

export const ReleaseGateResultSchema = z.object({
  passed:   z.boolean(),
  reasons:  z.array(z.string()),
});
export type ReleaseGateResult = z.infer<typeof ReleaseGateResultSchema>;
