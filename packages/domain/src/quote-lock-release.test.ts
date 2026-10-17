/**
 * Unit tests for the quote-lock release gate — Level Up Phase D (Unit 2).
 *
 * Directive Level Up Phase D:
 *   "Quote-lock: a claim without a valid quote cannot reach RELEASED."
 *
 * Covers:
 *   - checkQuoteLockReleaseGate passes when all witnessed claims are locked
 *   - checkQuoteLockReleaseGate blocks when a witnessed claim is not locked
 *   - non-witnessed claims are skipped (no quote required)
 *   - the gate blocks a RELEASED state when a claim lacks quote-lock
 *   - assertQuoteLockReleaseGate throws QuoteLockReleaseError
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import {
  QuoteLockReleaseError,
  checkQuoteLockReleaseGate,
  assertQuoteLockReleaseGate,
} from "./quote-lock-release.js";
import type { QuoteLockClaimRef } from "./quote-lock-release.js";
import type { ReleaseGateInput } from "@alinamatrix/contracts";

// ============================================================
// Fixtures
// ============================================================

function makeClaim(overrides: Partial<QuoteLockClaimRef> = {}): QuoteLockClaimRef {
  return {
    claimId:     "cccccccc-0000-4000-8000-000000000001",
    claimType:   "witnessed",
    quoteLocked: true,
    ...overrides,
  };
}

const PASSING_GATE: ReleaseGateInput = {
  validationsPassed:   true,
  criticalFindings:     0,
  fourEyesSatisfied:    true,
  manifestPresent:      true,
  checksumPresent:     true,
  sourceVersionIds:    ["aaaaaaaa-0000-4000-8000-000000000001"],
  versionPinsPresent:   true,
  sourceJobState:      "BUILT",
};

// ============================================================
// checkQuoteLockReleaseGate — passing
// ============================================================

describe("checkQuoteLockReleaseGate — passing", () => {
  it("passes when all witnessed claims are quote-locked", () => {
    const claims = [
      makeClaim({ claimId: "c1c1c1c1-0000-4000-8000-000000000001" }),
      makeClaim({ claimId: "c2c2c2c2-0000-4000-8000-000000000002" }),
    ];
    const result = checkQuoteLockReleaseGate(claims);
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.failedClaimIds).toHaveLength(0);
  });

  it("passes with no claims at all", () => {
    expect(checkQuoteLockReleaseGate([]).passed).toBe(true);
  });

  it("passes with non-witnessed claims only (inferred, assumption)", () => {
    const claims: QuoteLockClaimRef[] = [
      { claimId: "c1-1", claimType: "inferred", quoteLocked: false },
      { claimId: "c1-2", claimType: "assumption", quoteLocked: false },
    ];
    // Non-witnessed claims do not require a quote-lock
    const result = checkQuoteLockReleaseGate(claims);
    expect(result.passed).toBe(true);
  });

  it("passes when a mixed set has all witnessed claims locked", () => {
    const claims: QuoteLockClaimRef[] = [
      makeClaim({ claimId: "c1-1", claimType: "witnessed", quoteLocked: true }),
      { claimId: "c1-2", claimType: "inferred", quoteLocked: false },
      makeClaim({ claimId: "c1-3", claimType: "witnessed", quoteLocked: true }),
    ];
    expect(checkQuoteLockReleaseGate(claims).passed).toBe(true);
  });
});

// ============================================================
// checkQuoteLockReleaseGate — blocking
// ============================================================

describe("checkQuoteLockReleaseGate — blocking", () => {
  it("blocks when a witnessed claim is not quote-locked", () => {
    const claims = [
      makeClaim({ claimId: "c1-1", quoteLocked: false }),
    ];
    const result = checkQuoteLockReleaseGate(claims);
    expect(result.passed).toBe(false);
    expect(result.failedClaimIds).toContain("c1-1");
  });

  it("blocks when at least one of multiple witnessed claims is not locked", () => {
    const claims = [
      makeClaim({ claimId: "c1-1", quoteLocked: true }),
      makeClaim({ claimId: "c1-2", quoteLocked: false }),
      makeClaim({ claimId: "c1-3", quoteLocked: true }),
    ];
    const result = checkQuoteLockReleaseGate(claims);
    expect(result.passed).toBe(false);
    expect(result.failedClaimIds).toEqual(["c1-2"]);
  });

  it("blocks when a RELEASED release input has an unlocked witnessed claim", () => {
    const claims = [
      makeClaim({ claimId: "c1-1", quoteLocked: false }),
    ];
    const result = checkQuoteLockReleaseGate(claims, { ...PASSING_GATE, sourceJobState: "RELEASED" });
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("Release source job state is RELEASED")))
      .toBe(true);
  });

  it("does not add the release-state reason when the release is not RELEASED", () => {
    const claims = [
      makeClaim({ claimId: "c1-1", quoteLocked: false }),
    ];
    const result = checkQuoteLockReleaseGate(claims, PASSING_GATE);
    expect(result.passed).toBe(false);
    // The base reason mentions RELEASED ("cannot reach RELEASED"), but the
    // release-state reason ("Release source job state is RELEASED") must not
    // appear when the source job is not RELEASED.
    expect(result.reasons.some((r) => r.includes("Release source job state is RELEASED")))
      .toBe(false);
  });

  it("reports each failed claim id", () => {
    const claims = [
      makeClaim({ claimId: "a1-1", quoteLocked: false }),
      makeClaim({ claimId: "a1-2", quoteLocked: false }),
    ];
    const result = checkQuoteLockReleaseGate(claims);
    expect(result.failedClaimIds).toHaveLength(2);
  });
});

// ============================================================
// assertQuoteLockReleaseGate
// ============================================================

describe("assertQuoteLockReleaseGate", () => {
  it("does not throw when all witnessed claims are locked", () => {
    const claims = [makeClaim({ quoteLocked: true })];
    expect(() => assertQuoteLockReleaseGate(claims)).not.toThrow();
  });

  it("throws QuoteLockReleaseError when a witnessed claim is not locked", () => {
    const claims = [makeClaim({ claimId: "f1-1", quoteLocked: false })];
    expect(() => assertQuoteLockReleaseGate(claims)).toThrow(QuoteLockReleaseError);
  });

  it("the error carries the failed claim ids and reasons", () => {
    const claims = [
      makeClaim({ claimId: "f1-1", quoteLocked: false }),
    ];
    try {
      assertQuoteLockReleaseGate(claims);
    } catch (err) {
      expect(err).toBeInstanceOf(QuoteLockReleaseError);
      const e = err as QuoteLockReleaseError;
      expect(e.failedClaimIds).toContain("f1-1");
      expect(e.reasons.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("does not throw for non-witnessed claims without quote-lock", () => {
    const claims: QuoteLockClaimRef[] = [
      { claimId: "c1-1", claimType: "inferred", quoteLocked: false },
    ];
    expect(() => assertQuoteLockReleaseGate(claims)).not.toThrow();
  });
});
