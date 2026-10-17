/**
 * Unit tests for packages/domain/src/reviewer-diff.ts — reviewer diff between
 * two builds (Phase E Unit 1).
 *
 * Covers:
 *   - buildReviewerDiff: identical builds → identical=true, empty entries.
 *   - buildReviewerDiff: changed fields → entries with changed kind.
 *   - buildReviewerDiff: source version ids added/removed.
 *   - buildReviewerDiff: reviewer attribution (reviewerId, tenantId).
 *   - buildReviewerDiff: deterministic diffHash (same inputs → same hash).
 *   - buildReviewerDiff: different inputs → different diffHash.
 *   - buildReviewerDiff: summary is human-readable.
 *   - buildReviewerDiff: rejects empty reviewerId / tenantId.
 *
 * Directive Phase E:
 *   "Reviewer diff between two builds."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import {
  buildReviewerDiff,
  ReviewerDiffInputError,
} from "./reviewer-diff.js";
import type { ReviewerDiffSnapshot } from "@alinamatrix/contracts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REVIEWER  = "aaaaaaaa-0000-4000-a000-000000000001";
const TENANT    = "bbbbbbbb-0000-4000-b000-000000000002";
const ARTIFACT  = "cccccccc-0000-4000-c000-000000000003";

function makeSnapshot(overrides: Partial<ReviewerDiffSnapshot> = {}): ReviewerDiffSnapshot {
  return {
    artifactId:        ARTIFACT,
    buildId:           "11111111-0000-4000-b000-000000000001",
    htmlSha256:        "a".repeat(64),
    contentHash:       "b".repeat(64),
    manifestSha256:    "c".repeat(64),
    sourceVersionIds:  ["eeeeeeee-0000-4000-e000-000000000001"],
    buildTime:         "2026-10-06T12:00:00.000Z",
    ...overrides,
  };
}

function makeInput(
  overrides: {
    reviewerId?: string;
    tenantId?: string;
    before?: Partial<ReviewerDiffSnapshot>;
    after?: Partial<ReviewerDiffSnapshot>;
  } = {},
) {
  return {
    reviewerId: overrides.reviewerId ?? REVIEWER,
    tenantId:   overrides.tenantId ?? TENANT,
    before:     makeSnapshot(overrides.before),
    after:      makeSnapshot(overrides.after),
  };
}

// ===========================================================================
// Identical builds
// ===========================================================================

describe("buildReviewerDiff — identical builds", () => {
  it("identical builds return identical=true and empty entries", () => {
    const result = buildReviewerDiff(makeInput());
    expect(result.identical).toBe(true);
    expect(result.entries).toHaveLength(0);
  });

  it("identical builds have a 64-char hex diffHash", () => {
    const result = buildReviewerDiff(makeInput());
    expect(result.diffHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("carries reviewer attribution", () => {
    const result = buildReviewerDiff(makeInput());
    expect(result.reviewerId).toBe(REVIEWER);
    expect(result.tenantId).toBe(TENANT);
  });
});

// ===========================================================================
// Changed fields
// ===========================================================================

describe("buildReviewerDiff — changed fields", () => {
  it("changed html sha256 produces a changed entry", () => {
    const result = buildReviewerDiff(
      makeInput({ after: { htmlSha256: "z".repeat(64) } }),
    );
    expect(result.identical).toBe(false);
    const htmlEntry = result.entries.find((e) => e.field === "htmlSha256");
    expect(htmlEntry).toBeDefined();
    expect(htmlEntry?.kind).toBe("changed");
  });

  it("changed content hash produces a changed entry", () => {
    const result = buildReviewerDiff(
      makeInput({ after: { contentHash: "z".repeat(64) } }),
    );
    expect(result.entries.find((e) => e.field === "contentHash")).toBeDefined();
  });

  it("changed manifest sha256 produces a changed entry", () => {
    const result = buildReviewerDiff(
      makeInput({ after: { manifestSha256: "z".repeat(64) } }),
    );
    expect(result.entries.find((e) => e.field === "manifestSha256")).toBeDefined();
  });

  it("changed build time produces a changed entry", () => {
    const result = buildReviewerDiff(
      makeInput({ after: { buildTime: "2026-10-07T12:00:00.000Z" } }),
    );
    expect(result.entries.find((e) => e.field === "buildTime")).toBeDefined();
  });
});

// ===========================================================================
// Source version ids — added / removed
// ===========================================================================

describe("buildReviewerDiff — source version ids", () => {
  it("added source version id produces an added entry", () => {
    const result = buildReviewerDiff(
      makeInput({
        before: { sourceVersionIds: [] },
        after:  { sourceVersionIds: ["eeeeeeee-0000-4000-e000-000000000001"] },
      }),
    );
    const added = result.entries.find((e) => e.field === "sourceVersionIds" && e.kind === "added");
    expect(added).toBeDefined();
  });

  it("removed source version id produces a removed entry", () => {
    const result = buildReviewerDiff(
      makeInput({
        before: { sourceVersionIds: ["eeeeeeee-0000-4000-e000-000000000001"] },
        after:  { sourceVersionIds: [] },
      }),
    );
    const removed = result.entries.find((e) => e.field === "sourceVersionIds" && e.kind === "removed");
    expect(removed).toBeDefined();
  });
});

// ===========================================================================
// Determinism
// ===========================================================================

describe("buildReviewerDiff — determinism", () => {
  it("same inputs produce the same diffHash", () => {
    const a = buildReviewerDiff(makeInput({ after: { htmlSha256: "z".repeat(64) } }));
    const b = buildReviewerDiff(makeInput({ after: { htmlSha256: "z".repeat(64) } }));
    expect(a.diffHash).toBe(b.diffHash);
  });

  it("different reviewerId produces a different diffHash", () => {
    const a = buildReviewerDiff(makeInput({ reviewerId: REVIEWER }));
    const b = buildReviewerDiff(
      makeInput({ reviewerId: "ffffffff-0000-4000-f000-000000000099" }),
    );
    expect(a.diffHash).not.toBe(b.diffHash);
  });

  it("different inputs produce different diffHash", () => {
    const a = buildReviewerDiff(makeInput({ after: { htmlSha256: "z".repeat(64) } }));
    const b = buildReviewerDiff(makeInput({ after: { htmlSha256: "y".repeat(64) } }));
    expect(a.diffHash).not.toBe(b.diffHash);
  });
});

// ===========================================================================
// Summary
// ===========================================================================

describe("buildReviewerDiff — summary", () => {
  it("identical builds have a summary mentioning identical", () => {
    const result = buildReviewerDiff(makeInput());
    expect(result.summary).toContain("identical");
  });

  it("different builds have a summary mentioning the build ids", () => {
    const result = buildReviewerDiff(
      makeInput({ after: { htmlSha256: "z".repeat(64) } }),
    );
    expect(result.summary).toContain("differ");
  });
});

// ===========================================================================
// Input validation
// ===========================================================================

describe("buildReviewerDiff — input validation", () => {
  it("rejects empty reviewerId", () => {
    expect(() =>
      buildReviewerDiff(makeInput({ reviewerId: "" })),
    ).toThrow(ReviewerDiffInputError);
  });

  it("rejects empty tenantId", () => {
    expect(() =>
      buildReviewerDiff(makeInput({ tenantId: "" })),
    ).toThrow(ReviewerDiffInputError);
  });
});
