/**
 * Domain tests for Phase 9 Unit 4: revocation.
 *
 * All tests are pure (no I/O, no database).
 *
 * Covers:
 *   - revokeRelease: builds a revocation event record.
 *   - revokeRelease: records priorLabel (PUBLISHED or ARCHIVED) and does not
 *     mutate published bytes (pure function).
 *   - revokeRelease: throws RevocationInputError for invalid priorLabel.
 *   - revokeRelease: throws RevocationInputError for empty reason.
 *
 * Directive Phase 9:
 *   "Revoke writes an event. It does not mutate published bytes."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { revokeRelease, RevocationInputError } from "./revocation.js";

// ============================================================
// Fixtures
// ============================================================

const ARTIFACT_ID = "dddddddd-0000-4000-d000-000000000001";
const USER_ID     = "11111111-0000-4000-a000-000000000001";
const REVOKED_AT  = "2026-10-06T12:00:00.000Z";

// ============================================================
// revokeRelease
// ============================================================

describe("revokeRelease", () => {
  it("builds a revocation event with priorLabel PUBLISHED", () => {
    const event = revokeRelease({
      artifactId: ARTIFACT_ID,
      revokedBy:  USER_ID,
      reason:     "Superseded by version 2",
      revokedAt:  REVOKED_AT,
      priorLabel: "PUBLISHED",
    });
    expect(event.artifactId).toBe(ARTIFACT_ID);
    expect(event.revokedBy).toBe(USER_ID);
    expect(event.reason).toBe("Superseded by version 2");
    expect(event.revokedAt).toBe(REVOKED_AT);
    expect(event.priorLabel).toBe("PUBLISHED");
  });

  it("builds a revocation event with priorLabel ARCHIVED", () => {
    const event = revokeRelease({
      artifactId: ARTIFACT_ID,
      revokedBy:  USER_ID,
      reason:     "Archived artifact revoked",
      revokedAt:  REVOKED_AT,
      priorLabel: "ARCHIVED",
    });
    expect(event.priorLabel).toBe("ARCHIVED");
  });

  it("does not mutate published bytes (pure function — returns a new record)", () => {
    const input = {
      artifactId: ARTIFACT_ID,
      revokedBy:  USER_ID,
      reason:     "Test revocation",
      revokedAt:  REVOKED_AT,
      priorLabel: "PUBLISHED" as const,
    };
    const event1 = revokeRelease(input);
    const event2 = revokeRelease(input);
    expect(event1).toEqual(event2);
    expect(event1).not.toBe(input);
  });

  it("throws RevocationInputError when priorLabel is DRAFT", () => {
    expect(() => revokeRelease({
      artifactId: ARTIFACT_ID,
      revokedBy:  USER_ID,
      reason:     "reason",
      revokedAt:  REVOKED_AT,
      priorLabel: "DRAFT" as "PUBLISHED",
    })).toThrow(RevocationInputError);
  });

  it("throws RevocationInputError when priorLabel is REVOKED", () => {
    expect(() => revokeRelease({
      artifactId: ARTIFACT_ID,
      revokedBy:  USER_ID,
      reason:     "reason",
      revokedAt:  REVOKED_AT,
      priorLabel: "REVOKED" as "PUBLISHED",
    })).toThrow(RevocationInputError);
  });

  it("throws RevocationInputError when reason is empty", () => {
    expect(() => revokeRelease({
      artifactId: ARTIFACT_ID,
      revokedBy:  USER_ID,
      reason:     "",
      revokedAt:  REVOKED_AT,
      priorLabel: "PUBLISHED",
    })).toThrow(RevocationInputError);
  });

  it("the error message for invalid priorLabel contains the bad label", () => {
    try {
      revokeRelease({
        artifactId: ARTIFACT_ID,
        revokedBy:  USER_ID,
        reason:     "reason",
        revokedAt:  REVOKED_AT,
        priorLabel: "DRAFT" as "PUBLISHED",
      });
    } catch (err) {
      expect(err).toBeInstanceOf(RevocationInputError);
      expect((err as RevocationInputError).message).toContain("DRAFT");
    }
  });

  it("does not reference or mutate any published HTML bytes", () => {
    const event = revokeRelease({
      artifactId: ARTIFACT_ID,
      revokedBy:  USER_ID,
      reason:     "No bytes touched",
      revokedAt:  REVOKED_AT,
      priorLabel: "PUBLISHED",
    });
    expect(event).not.toHaveProperty("publishedHtml");
    expect(event).not.toHaveProperty("html");
  });
});
