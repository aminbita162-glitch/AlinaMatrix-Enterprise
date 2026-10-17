/**
 * Unit tests for numeric reconciliation — Level Up Phase D (Unit 3).
 *
 * Directive Level Up Phase D:
 *   "Numeric reconciliation: numbers in the document are checked against
 *    the source; differences are recorded, not corrected."
 *
 * Covers:
 *   - reconcileNumber — matches when document === source
 *   - reconcileNumber — records difference when document !== source
 *   - reconcileNumber — does not mutate inputs
 *   - reconcileNumbers — returns one record per pair
 *   - discrepanciesOnly — returns only non-matching records
 *   - assertAllNumbersReconcile — throws when a discrepancy exists
 *   - recordHash is deterministic for the same inputs
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import {
  reconcileNumber,
  reconcileNumbers,
  discrepanciesOnly,
  assertAllNumbersReconcile,
  NumericReconciliationError,
} from "./numeric-reconciliation.js";
import type { NumericPair, NumericReconciliationRecord } from "./numeric-reconciliation.js";

// ============================================================
// Fixtures
// ============================================================

function makePair(overrides: Partial<NumericPair> = {}): NumericPair {
  return {
    claimId:       "cccccccc-0000-4000-8000-000000000001",
    label:         "study size",
    documentValue: 240,
    sourceValue:   240,
    unit:          "patients",
    ...overrides,
  };
}

// ============================================================
// reconcileNumber — matches
// ============================================================

describe("reconcileNumber — matches", () => {
  it("returns matches=true when document equals source", () => {
    const record = reconcileNumber(makePair());
    expect(record.matches).toBe(true);
    expect(record.difference).toBe(0);
  });

  it("returns matches=true for zero values that match", () => {
    const record = reconcileNumber(makePair({ documentValue: 0, sourceValue: 0 }));
    expect(record.matches).toBe(true);
  });

  it("returns matches=true for negative values that match", () => {
    const record = reconcileNumber(makePair({
      documentValue: -5,
      sourceValue:   -5,
      unit:          "degrees C",
    }));
    expect(record.matches).toBe(true);
  });
});

// ============================================================
// reconcileNumber — discrepancies
// ============================================================

describe("reconcileNumber — discrepancies", () => {
  it("returns matches=false when document > source", () => {
    const record = reconcileNumber(makePair({ documentValue: 250, sourceValue: 240 }));
    expect(record.matches).toBe(false);
    expect(record.difference).toBe(10);
  });

  it("returns matches=false when document < source", () => {
    const record = reconcileNumber(makePair({ documentValue: 230, sourceValue: 240 }));
    expect(record.matches).toBe(false);
    expect(record.difference).toBe(-10);
  });

  it("records the difference as document - source (not the other way)", () => {
    const record = reconcileNumber(makePair({ documentValue: 100, sourceValue: 200 }));
    expect(record.difference).toBe(-100);
  });

  it("does not mutate the input pair", () => {
    const pair = makePair({ documentValue: 250, sourceValue: 240 });
    const snapshot = { ...pair };
    reconcileNumber(pair);
    expect(pair).toEqual(snapshot);
  });
});

// ============================================================
// recordHash
// ============================================================

describe("recordHash", () => {
  it("is deterministic for the same inputs", () => {
    const a = reconcileNumber(makePair());
    const b = reconcileNumber(makePair());
    expect(a.recordHash).toBe(b.recordHash);
  });

  it("differs when the document value differs", () => {
    const a = reconcileNumber(makePair({ documentValue: 240 }));
    const b = reconcileNumber(makePair({ documentValue: 250 }));
    expect(a.recordHash).not.toBe(b.recordHash);
  });

  it("differs when the claim id differs", () => {
    const a = reconcileNumber(makePair({ claimId: "a-1" }));
    const b = reconcileNumber(makePair({ claimId: "b-2" }));
    expect(a.recordHash).not.toBe(b.recordHash);
  });
});

// ============================================================
// reconcileNumbers
// ============================================================

describe("reconcileNumbers", () => {
  it("returns one record per pair, in order", () => {
    const pairs = [
      makePair({ claimId: "c-1", documentValue: 240, sourceValue: 240 }),
      makePair({ claimId: "c-2", documentValue: 250, sourceValue: 240 }),
      makePair({ claimId: "c-3", documentValue: 100, sourceValue: 100 }),
    ];
    const records = reconcileNumbers(pairs);
    expect(records).toHaveLength(3);
    expect(records[0]!.claimId).toBe("c-1");
    expect(records[1]!.claimId).toBe("c-2");
    expect(records[2]!.claimId).toBe("c-3");
  });

  it("returns an empty array for an empty input", () => {
    expect(reconcileNumbers([])).toEqual([]);
  });
});

// ============================================================
// discrepanciesOnly
// ============================================================

describe("discrepanciesOnly", () => {
  it("returns only the non-matching records", () => {
    const records: NumericReconciliationRecord[] = [
      { claimId: "c-1", label: "a", documentValue: 10, sourceValue: 10, difference: 0, matches: true,  unit: null, recordHash: "h1" },
      { claimId: "c-2", label: "b", documentValue: 20, sourceValue: 10, difference: 10, matches: false, unit: null, recordHash: "h2" },
      { claimId: "c-3", label: "c", documentValue: 30, sourceValue: 30, difference: 0, matches: true,  unit: null, recordHash: "h3" },
    ];
    const discrepancies = discrepanciesOnly(records);
    expect(discrepancies).toHaveLength(1);
    expect(discrepancies[0]!.claimId).toBe("c-2");
  });

  it("returns empty when all match", () => {
    const records: NumericReconciliationRecord[] = [
      { claimId: "c-1", label: "a", documentValue: 10, sourceValue: 10, difference: 0, matches: true, unit: null, recordHash: "h1" },
    ];
    expect(discrepanciesOnly(records)).toHaveLength(0);
  });
});

// ============================================================
// assertAllNumbersReconcile
// ============================================================

describe("assertAllNumbersReconcile", () => {
  it("does not throw when all pairs reconcile", () => {
    const pairs = [
      makePair({ claimId: "c-1", documentValue: 240, sourceValue: 240 }),
      makePair({ claimId: "c-2", documentValue: 100, sourceValue: 100 }),
    ];
    expect(() => assertAllNumbersReconcile(pairs)).not.toThrow();
  });

  it("throws NumericReconciliationError when a discrepancy exists", () => {
    const pairs = [
      makePair({ claimId: "c-1", documentValue: 240, sourceValue: 240 }),
      makePair({ claimId: "c-2", documentValue: 250, sourceValue: 240 }),
    ];
    expect(() => assertAllNumbersReconcile(pairs)).toThrow(NumericReconciliationError);
  });

  it("the error carries the discrepancy records", () => {
    const pairs = [
      makePair({ claimId: "c-1", documentValue: 250, sourceValue: 240 }),
    ];
    try {
      assertAllNumbersReconcile(pairs);
    } catch (err) {
      expect(err).toBeInstanceOf(NumericReconciliationError);
      const e = err as NumericReconciliationError;
      expect(e.discrepancies).toHaveLength(1);
      expect(e.discrepancies[0]!.claimId).toBe("c-1");
      expect(e.discrepancies[0]!.difference).toBe(10);
    }
  });

  it("does not throw on an empty list", () => {
    expect(() => assertAllNumbersReconcile([])).not.toThrow();
  });

  it("does not mutate any input pair", () => {
    const pairs = [
      makePair({ documentValue: 250, sourceValue: 240 }),
    ];
    const snapshot = pairs.map((p) => ({ ...p }));
    try {
      assertAllNumbersReconcile(pairs);
    } catch {
      // expected
    }
    expect(pairs).toEqual(snapshot);
  });
});
