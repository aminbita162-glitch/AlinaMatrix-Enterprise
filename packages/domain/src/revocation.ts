/**
 * Revocation domain logic — Phase 9 (Unit 4: revocation).
 *
 * Covers:
 *   - revokeRelease — builds a revocation event record. Pure — does not
 *     mutate published bytes. Records the prior label (PUBLISHED) and the
 *     new label (REVOKED).
 *
 * Directive Phase 9:
 *   "Revoke writes an event. It does not mutate published bytes."
 *
 * The revocation event is append-only: the DB trigger (migration 011)
 * rejects UPDATE and DELETE on revocation_events. The published_html
 * column in release_labels is protected by the migration 008 trigger
 * (BEFORE UPDATE rejects any change to published_html).
 *
 * Status: Enterprise Candidate — Active Development
 */
import type { RevocationEvent } from "@alinamatrix/contracts";

// ============================================================
// Revocation
// ============================================================

export interface RevokeReleaseInput {
  artifactId:   string;
  revokedBy:    string;
  reason:       string;
  /** ISO-8601 UTC timestamp. If omitted, the caller must supply one. */
  revokedAt:    string;
  /** The label the artifact had before revocation. Must be PUBLISHED or ARCHIVED. */
  priorLabel:   "PUBLISHED" | "ARCHIVED";
}

/**
 * Build a revocation event record for an artifact.
 *
 * Pure function — does not mutate published bytes. The caller is
 * responsible for:
 *   1. Writing this event to revocation_events (append-only, INSERT only).
 *   2. Transitioning the release label to REVOKED (updateReleaseLabel).
 *
 * The published_html in release_labels is protected by a trigger
 * (migration 008) that rejects any UPDATE of that column — so the
 * published bytes are never mutated by revocation.
 *
 * @example
 *   const event = revokeRelease({
 *     artifactId: "uuid",
 *     revokedBy: "user-uuid",
 *     reason: "Superseded by version 2",
 *     revokedAt: "2026-10-06T12:00:00.000Z",
 *     priorLabel: "PUBLISHED",
 *   });
 */
export function revokeRelease(input: RevokeReleaseInput): RevocationEvent {
  if (input.priorLabel !== "PUBLISHED" && input.priorLabel !== "ARCHIVED") {
    throw new RevocationInputError(
      `priorLabel must be PUBLISHED or ARCHIVED, got "${input.priorLabel}"`,
    );
  }
  if (input.reason.length === 0) {
    throw new RevocationInputError("reason must not be empty");
  }
  return {
    artifactId:   input.artifactId,
    revokedBy:    input.revokedBy,
    reason:       input.reason,
    revokedAt:    input.revokedAt,
    priorLabel:   input.priorLabel,
  };
}

// ============================================================
// Errors
// ============================================================

export class RevocationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevocationInputError";
  }
}
