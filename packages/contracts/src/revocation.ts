/**
 * Revocation contracts — Phase 9 (Unit 4: revocation).
 *
 * Zod schemas for revocation events:
 *   - RevocationEventSchema — artifact_id, revoked_by, reason, revoked_at,
 *     prior_label. Append-only.
 *
 * Directive Phase 9:
 *   "Revoke writes an event. It does not mutate published bytes."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

// ============================================================
// Revocation event (append-only)
// ============================================================

const ReleaseLabelSchema = z.enum([
  "DRAFT",
  "INTERNAL_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "ARCHIVED",
  "REVOKED",
]);

export const RevocationEventSchema = z.object({
  artifactId:    z.string().uuid(),
  /** User who performed the revocation. */
  revokedBy:     z.string().uuid(),
  /** English reason for the revocation. */
  reason:        z.string().min(1).max(4096),
  /** ISO-8601 UTC timestamp of the revocation. */
  revokedAt:     z.string().datetime(),
  /** The label the artifact had before revocation (PUBLISHED or ARCHIVED). */
  priorLabel:    ReleaseLabelSchema,
});
export type RevocationEvent = z.infer<typeof RevocationEventSchema>;
