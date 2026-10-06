/**
 * Domain tests for Phase 9 Unit 1: release gate and label lifecycle.
 *
 * All tests are pure (no I/O, no database).
 *
 * Covers:
 *   - checkReleaseGate: passes when all conditions met; blocks on each failure.
 *   - assertReleaseGate: throws ReleaseGateError with reasons.
 *   - Label transitions: legal and illegal transitions.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import {
  checkReleaseGate,
  assertReleaseGate,
  ReleaseGateError,
  isLegalLabelTransition,
  assertLegalLabelTransition,
  IllegalLabelError,
} from "./release.js";
import type { ReleaseGateInput, ReleaseLabel } from "@alinamatrix/contracts";

// ============================================================
// Fixtures
// ============================================================

const PASSING_GATE: ReleaseGateInput = {
  validationsPassed:   true,
  criticalFindings:    0,
  fourEyesSatisfied:   true,
  manifestPresent:     true,
  checksumPresent:     true,
  sourceVersionIds:   ["aaaaaaaa-0000-4000-8000-000000000001"],
  versionPinsPresent:  true,
  sourceJobState:     "BUILT",
};

// ============================================================
// checkReleaseGate — passing
// ============================================================

describe("checkReleaseGate — passing", () => {
  it("passes when all conditions are met", () => {
    const result = checkReleaseGate(PASSING_GATE);
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("passes with APPROVED source job state", () => {
    const result = checkReleaseGate({ ...PASSING_GATE, sourceJobState: "APPROVED" });
    expect(result.passed).toBe(true);
  });

  it("passes with RELEASED source job state", () => {
    const result = checkReleaseGate({ ...PASSING_GATE, sourceJobState: "RELEASED" });
    expect(result.passed).toBe(true);
  });
});

// ============================================================
// checkReleaseGate — blocking conditions
// ============================================================

describe("checkReleaseGate — blocking conditions", () => {
  it("blocks when validations did not pass", () => {
    const result = checkReleaseGate({ ...PASSING_GATE, validationsPassed: false });
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("validations did not pass");
  });

  it("blocks when critical findings > 0", () => {
    const result = checkReleaseGate({ ...PASSING_GATE, criticalFindings: 1 });
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("critical findings"))).toBe(true);
  });

  it("blocks when critical findings = 3 (reports count)", () => {
    const result = checkReleaseGate({ ...PASSING_GATE, criticalFindings: 3 });
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("3"))).toBe(true);
  });

  it("blocks when four-eyes not satisfied", () => {
    const result = checkReleaseGate({ ...PASSING_GATE, fourEyesSatisfied: false });
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("four-eyes"))).toBe(true);
  });

  it("blocks when manifest missing", () => {
    const result = checkReleaseGate({ ...PASSING_GATE, manifestPresent: false });
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("manifest missing");
  });

  it("blocks when checksum missing", () => {
    const result = checkReleaseGate({ ...PASSING_GATE, checksumPresent: false });
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("checksum (html sha256) missing");
  });

  it("blocks when source version ids empty", () => {
    const result = checkReleaseGate({ ...PASSING_GATE, sourceVersionIds: [] });
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("source version ids empty");
  });

  it("blocks when version pins missing", () => {
    const result = checkReleaseGate({ ...PASSING_GATE, versionPinsPresent: false });
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("version pins missing (prompt, model, schema, policy)");
  });

  it("blocks when source job is FAILED_RETRYABLE", () => {
    const result = checkReleaseGate({ ...PASSING_GATE, sourceJobState: "FAILED_RETRYABLE" });
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("FAILED_RETRYABLE"))).toBe(true);
  });

  it("blocks when source job is FAILED_TERMINAL", () => {
    const result = checkReleaseGate({ ...PASSING_GATE, sourceJobState: "FAILED_TERMINAL" });
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("FAILED_TERMINAL"))).toBe(true);
  });

  it("blocks when source job is CANCELLED", () => {
    const result = checkReleaseGate({ ...PASSING_GATE, sourceJobState: "CANCELLED" });
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("CANCELLED"))).toBe(true);
  });

  it("accumulates multiple reasons", () => {
    const result = checkReleaseGate({
      ...PASSING_GATE,
      validationsPassed: false,
      criticalFindings: 2,
      manifestPresent: false,
    });
    expect(result.passed).toBe(false);
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================
// assertReleaseGate
// ============================================================

describe("assertReleaseGate", () => {
  it("does not throw when the gate passes", () => {
    expect(() => assertReleaseGate(PASSING_GATE)).not.toThrow();
  });

  it("throws ReleaseGateError when the gate fails", () => {
    expect(() => assertReleaseGate({ ...PASSING_GATE, validationsPassed: false }))
      .toThrow(ReleaseGateError);
  });

  it("the error carries the reasons array", () => {
    try {
      assertReleaseGate({ ...PASSING_GATE, validationsPassed: false, criticalFindings: 1 });
    } catch (err) {
      expect(err).toBeInstanceOf(ReleaseGateError);
      expect((err as ReleaseGateError).reasons.length).toBeGreaterThanOrEqual(2);
    }
  });
});

// ============================================================
// Release label transitions
// ============================================================

describe("release label transitions", () => {
  it("DRAFT -> INTERNAL_REVIEW is legal", () => {
    expect(isLegalLabelTransition("DRAFT", "INTERNAL_REVIEW")).toBe(true);
  });

  it("INTERNAL_REVIEW -> APPROVED is legal", () => {
    expect(isLegalLabelTransition("INTERNAL_REVIEW", "APPROVED")).toBe(true);
  });

  it("APPROVED -> PUBLISHED is legal", () => {
    expect(isLegalLabelTransition("APPROVED", "PUBLISHED")).toBe(true);
  });

  it("PUBLISHED -> ARCHIVED is legal", () => {
    expect(isLegalLabelTransition("PUBLISHED", "ARCHIVED")).toBe(true);
  });

  it("PUBLISHED -> REVOKED is legal", () => {
    expect(isLegalLabelTransition("PUBLISHED", "REVOKED")).toBe(true);
  });

  it("ARCHIVED -> REVOKED is legal", () => {
    expect(isLegalLabelTransition("ARCHIVED", "REVOKED")).toBe(true);
  });

  it("DRAFT -> PUBLISHED is illegal (skips INTERNAL_REVIEW and APPROVED)", () => {
    expect(isLegalLabelTransition("DRAFT", "PUBLISHED")).toBe(false);
  });

  it("REVOKED -> PUBLISHED is illegal (revoked is terminal)", () => {
    expect(isLegalLabelTransition("REVOKED", "PUBLISHED")).toBe(false);
  });

  it("assertLegalLabelTransition throws on illegal transition", () => {
    expect(() => assertLegalLabelTransition("DRAFT", "PUBLISHED"))
      .toThrow(IllegalLabelError);
  });

  it("assertLegalLabelTransition does not throw on legal transition", () => {
    expect(() => assertLegalLabelTransition("APPROVED", "PUBLISHED")).not.toThrow();
  });
});

// ============================================================
// ReleaseLabel type coverage
// ============================================================

describe("ReleaseLabel type", () => {
  it("has exactly six labels", () => {
    const labels: ReleaseLabel[] = [
      "DRAFT", "INTERNAL_REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED", "REVOKED",
    ];
    expect(labels).toHaveLength(6);
    expect(new Set(labels).size).toBe(6);
  });
});
