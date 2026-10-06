/**
 * Unit tests for packages/domain/src/claims.ts
 *
 * Required by Phase 4 directive:
 *   - quote-lock mismatch fails
 *   - unsupported cannot be stored as supported
 *   - terminology uniqueness (domain guard)
 *   - numeric reconciliation unit mismatch detection
 *   - claim graph traversal
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import {
  assertQuoteLock,
  computeQuoteHash,
  assertNegativeEvidenceNote,
  detectUnitMismatch,
  buildClaimGraph,
  traverseFrom,
  QuoteLockError,
  MissingNegativeEvidenceError,
} from "../src/claims.js";
import type { ClaimInput, ClaimEdge } from "../src/claims.js";

// ============================================================
// Helpers
// ============================================================

function makeClaimInput(overrides: Partial<ClaimInput> = {}): ClaimInput {
  return {
    subject:              "Study population",
    predicate:            "size",
    object:               "240",
    claimText:            "Study population was 240.",
    claimType:            "witnessed",
    supportStatus:        "supported",
    negativeEvidenceNote: "No contradicting population counts found.",
    ...overrides,
  };
}

// ============================================================
// assertQuoteLock — directive requires: "quote-lock mismatch fails"
// ============================================================

describe("assertQuoteLock", () => {
  const fragmentText = "The study enrolled 240 patients between 2020 and 2022 in three centres.";

  it("passes when claim_type is not witnessed (no-op)", () => {
    // Should not throw for non-witnessed claims regardless of quote
    expect(() =>
      assertQuoteLock("inferred", fragmentText, null, null),
    ).not.toThrow();

    expect(() =>
      assertQuoteLock("assumption", fragmentText, "mismatched quote", "badhash"),
    ).not.toThrow();
  });

  it("passes when quote is an exact substring and hash matches", () => {
    const quote = "240 patients between 2020 and 2022";
    const hash = computeQuoteHash(quote);
    expect(() =>
      assertQuoteLock("witnessed", fragmentText, quote, hash),
    ).not.toThrow();
  });

  it("throws QuoteLockError when no quote is supplied for a witnessed claim", () => {
    expect(() =>
      assertQuoteLock("witnessed", fragmentText, null, null),
    ).toThrow(QuoteLockError);

    expect(() =>
      assertQuoteLock("witnessed", fragmentText, "", null),
    ).toThrow(QuoteLockError);
  });

  it("throws QuoteLockError when quote is not a substring of the fragment", () => {
    const badQuote = "enrolled 500 patients";
    const hash = computeQuoteHash(badQuote);
    expect(() =>
      assertQuoteLock("witnessed", fragmentText, badQuote, hash),
    ).toThrow(QuoteLockError);
  });

  it("throws QuoteLockError when quote is a substring but hash does not match", () => {
    const quote = "240 patients between 2020 and 2022";
    const wrongHash = "a".repeat(64);
    expect(() =>
      assertQuoteLock("witnessed", fragmentText, quote, wrongHash),
    ).toThrow(QuoteLockError);
  });

  it("throws QuoteLockError when hash is null but quote is present", () => {
    const quote = "240 patients between 2020 and 2022";
    expect(() =>
      assertQuoteLock("witnessed", fragmentText, quote, null),
    ).toThrow(QuoteLockError);
  });

  it("throws QuoteLockError when quote is correct but hash has wrong length", () => {
    const quote = "240 patients between 2020 and 2022";
    const truncatedHash = computeQuoteHash(quote).slice(0, 32);
    expect(() =>
      assertQuoteLock("witnessed", fragmentText, quote, truncatedHash),
    ).toThrow(QuoteLockError);
  });

  it("error message mentions hash mismatch when hash is wrong", () => {
    const quote = "240 patients between 2020 and 2022";
    const wrongHash = "b".repeat(64);
    let caught: unknown;
    try {
      assertQuoteLock("witnessed", fragmentText, quote, wrongHash);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(QuoteLockError);
    expect((caught as QuoteLockError).message).toContain("hash mismatch");
  });

  it("error message mentions substring failure when quote is absent from fragment", () => {
    const badQuote = "never appears in the fragment text";
    const hash = computeQuoteHash(badQuote);
    let caught: unknown;
    try {
      assertQuoteLock("witnessed", fragmentText, badQuote, hash);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(QuoteLockError);
    expect((caught as QuoteLockError).message).toContain("exact substring");
  });
});

// ============================================================
// computeQuoteHash
// ============================================================

describe("computeQuoteHash", () => {
  it("returns a 64-character hex string", () => {
    const hash = computeQuoteHash("hello world");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same input produces same output", () => {
    const text = "The study enrolled 240 patients.";
    expect(computeQuoteHash(text)).toBe(computeQuoteHash(text));
  });

  it("produces different hashes for different inputs", () => {
    expect(computeQuoteHash("abc")).not.toBe(computeQuoteHash("abd"));
  });
});

// ============================================================
// assertNegativeEvidenceNote
// Directive: "unsupported cannot be stored as supported"
// Directive: "negative_evidence_note required when supported or inferred"
// ============================================================

describe("assertNegativeEvidenceNote", () => {
  it("passes when support_status is supported and note is supplied", () => {
    expect(() =>
      assertNegativeEvidenceNote(
        makeClaimInput({
          claimType:            "witnessed",
          supportStatus:        "supported",
          negativeEvidenceNote: "No contradicting data found in the corpus.",
        }),
      ),
    ).not.toThrow();
  });

  it("passes when claim_type is inferred and note is supplied", () => {
    expect(() =>
      assertNegativeEvidenceNote(
        makeClaimInput({
          claimType:            "inferred",
          supportStatus:        "weak",
          negativeEvidenceNote: "Inference follows from methodology section.",
        }),
      ),
    ).not.toThrow();
  });

  it("throws MissingNegativeEvidenceError when supported and note is absent", () => {
    expect(() =>
      assertNegativeEvidenceNote(
        makeClaimInput({
          claimType:            "witnessed",
          supportStatus:        "supported",
          negativeEvidenceNote: null,
        }),
      ),
    ).toThrow(MissingNegativeEvidenceError);
  });

  it("throws MissingNegativeEvidenceError when supported and note is empty string", () => {
    expect(() =>
      assertNegativeEvidenceNote(
        makeClaimInput({
          claimType:            "witnessed",
          supportStatus:        "supported",
          negativeEvidenceNote: "   ",
        }),
      ),
    ).toThrow(MissingNegativeEvidenceError);
  });

  it("throws MissingNegativeEvidenceError when claim_type is inferred and note is missing", () => {
    expect(() =>
      assertNegativeEvidenceNote(
        makeClaimInput({
          claimType:            "inferred",
          supportStatus:        "weak",
          negativeEvidenceNote: null,
        }),
      ),
    ).toThrow(MissingNegativeEvidenceError);
  });

  it("does NOT throw for unsupported status with witnessed claim (note not required)", () => {
    expect(() =>
      assertNegativeEvidenceNote(
        makeClaimInput({
          claimType:            "witnessed",
          supportStatus:        "unsupported",
          negativeEvidenceNote: null,
        }),
      ),
    ).not.toThrow();
  });

  it("does NOT throw for weak status with assumption claim (note not required)", () => {
    expect(() =>
      assertNegativeEvidenceNote(
        makeClaimInput({
          claimType:            "assumption",
          supportStatus:        "weak",
          negativeEvidenceNote: null,
        }),
      ),
    ).not.toThrow();
  });

  it("does NOT throw for conflicting status (note not required)", () => {
    expect(() =>
      assertNegativeEvidenceNote(
        makeClaimInput({
          claimType:            "assumption",
          supportStatus:        "conflicting",
          negativeEvidenceNote: null,
        }),
      ),
    ).not.toThrow();
  });

  it("does NOT throw for not_applicable status (note not required)", () => {
    expect(() =>
      assertNegativeEvidenceNote(
        makeClaimInput({
          claimType:            "assumption",
          supportStatus:        "not_applicable",
          negativeEvidenceNote: null,
        }),
      ),
    ).not.toThrow();
  });

  it("error message names the required support_status", () => {
    let caught: unknown;
    try {
      assertNegativeEvidenceNote(
        makeClaimInput({ claimType: "witnessed", supportStatus: "supported", negativeEvidenceNote: null }),
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MissingNegativeEvidenceError);
    expect((caught as MissingNegativeEvidenceError).message).toContain("supported");
  });
});

// ============================================================
// detectUnitMismatch — numeric reconciliation
// ============================================================

describe("detectUnitMismatch", () => {
  const base = { subject: "treatment duration", predicate: "equals" };

  it("returns null when subjects differ", () => {
    const result = detectUnitMismatch(
      { id: "a", subject: "duration", predicate: "equals", unit: "days" },
      { id: "b", subject: "interval",  predicate: "equals", unit: "weeks" },
    );
    expect(result).toBeNull();
  });

  it("returns null when predicates differ", () => {
    const result = detectUnitMismatch(
      { id: "a", ...base, unit: "days" },
      { id: "b", subject: base.subject, predicate: "exceeds", unit: "weeks" },
    );
    expect(result).toBeNull();
  });

  it("returns null when either unit is null", () => {
    expect(detectUnitMismatch(
      { id: "a", ...base, unit: null },
      { id: "b", ...base, unit: "weeks" },
    )).toBeNull();

    expect(detectUnitMismatch(
      { id: "a", ...base, unit: "days" },
      { id: "b", ...base, unit: null },
    )).toBeNull();
  });

  it("returns null when units match", () => {
    const result = detectUnitMismatch(
      { id: "a", ...base, unit: "days" },
      { id: "b", ...base, unit: "days" },
    );
    expect(result).toBeNull();
  });

  it("returns a UnitMismatchFlag when same subject/predicate but different units", () => {
    const result = detectUnitMismatch(
      { id: "claim-a", ...base, unit: "days" },
      { id: "claim-b", ...base, unit: "weeks" },
    );
    expect(result).not.toBeNull();
    expect(result!.unitMismatch).toBe(true);
    expect(result!.claimAId).toBe("claim-a");
    expect(result!.claimBId).toBe("claim-b");
    expect(result!.unitA).toBe("days");
    expect(result!.unitB).toBe("weeks");
    expect(result!.subject).toBe(base.subject);
    expect(result!.predicate).toBe(base.predicate);
  });

  it("does not auto-correct — unitB is returned unchanged", () => {
    const result = detectUnitMismatch(
      { id: "a", ...base, unit: "mg/kg" },
      { id: "b", ...base, unit: "mg" },
    );
    expect(result!.unitA).toBe("mg/kg");
    expect(result!.unitB).toBe("mg");
  });
});

// ============================================================
// buildClaimGraph and traverseFrom
// ============================================================

describe("buildClaimGraph and traverseFrom", () => {
  const edges: ClaimEdge[] = [
    { sourceClaimId: "c1", targetClaimId: "c2", edgeType: "SUPPORTS" },
    { sourceClaimId: "c1", targetClaimId: "c3", edgeType: "DERIVED_FROM" },
    { sourceClaimId: "c2", targetClaimId: "c4", edgeType: "CONTRADICTS" },
    { sourceClaimId: "c3", targetClaimId: "c4", edgeType: "SUPPORTS" },
  ];

  it("builds an adjacency map with correct outbound edges", () => {
    const adj = buildClaimGraph(edges);
    expect(adj.has("c1")).toBe(true);
    expect(adj.get("c1")).toHaveLength(2);
    expect(adj.get("c2")).toHaveLength(1);
    expect(adj.get("c3")).toHaveLength(1);
    expect(adj.has("c4")).toBe(false); // leaf node has no outbound edges
  });

  it("returns empty adjacency map for empty edge list", () => {
    const adj = buildClaimGraph([]);
    expect(adj.size).toBe(0);
  });

  it("traverseFrom returns all reachable claim ids via BFS", () => {
    const adj = buildClaimGraph(edges);
    const reachable = traverseFrom("c1", adj);
    expect(reachable).toContain("c2");
    expect(reachable).toContain("c3");
    expect(reachable).toContain("c4");
    expect(reachable).not.toContain("c1"); // start node excluded
  });

  it("traverseFrom returns empty array from a leaf node", () => {
    const adj = buildClaimGraph(edges);
    const reachable = traverseFrom("c4", adj);
    expect(reachable).toHaveLength(0);
  });

  it("traverseFrom returns empty array when start id is not in the graph", () => {
    const adj = buildClaimGraph(edges);
    const reachable = traverseFrom("unknown", adj);
    expect(reachable).toHaveLength(0);
  });

  it("traverseFrom does not visit the same node twice (no infinite loop)", () => {
    // Create a cycle: c1 -> c2 -> c1
    const cyclicEdges: ClaimEdge[] = [
      { sourceClaimId: "c1", targetClaimId: "c2", edgeType: "SUPPORTS" },
      { sourceClaimId: "c2", targetClaimId: "c1", edgeType: "SUPPORTS" },
    ];
    const adj = buildClaimGraph(cyclicEdges);
    const reachable = traverseFrom("c1", adj);
    // c2 should appear exactly once
    expect(reachable.filter((id) => id === "c2")).toHaveLength(1);
    expect(reachable.filter((id) => id === "c1")).toHaveLength(0);
  });

  it("edge types are preserved in the adjacency map", () => {
    const adj = buildClaimGraph(edges);
    const c1Edges = adj.get("c1")!;
    const supportsEdge = c1Edges.find((e) => e.targetClaimId === "c2");
    const derivedEdge  = c1Edges.find((e) => e.targetClaimId === "c3");
    expect(supportsEdge?.edgeType).toBe("SUPPORTS");
    expect(derivedEdge?.edgeType).toBe("DERIVED_FROM");
  });
});
