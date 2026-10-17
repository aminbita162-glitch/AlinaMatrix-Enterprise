/**
 * Unit tests for the assumption register — Level Up Phase D (Unit 1).
 *
 * Directive Level Up Phase D:
 *   "Assumption register: each assumption has source, owner, and expiry."
 *
 * Covers:
 *   - assertAssumptionRegistered — passes when source + owner + expiry present
 *   - assertAssumptionRegistered — throws AssumptionRegisterError when any field
 *     is missing or blank
 *   - assertAllAssumptionsRegistered — validates a list, reports violations
 *   - checkAssumptionExpiry — expired vs not-expired
 *   - assertAssumptionNotExpired — throws when expired
 *   - filterExpiredAssumptions — returns only non-expired
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import {
  AssumptionRegisterError,
  assertAssumptionRegistered,
  assertAllAssumptionsRegistered,
  checkAssumptionExpiry,
  assertAssumptionNotExpired,
  filterExpiredAssumptions,
} from "./assumption-register.js";
import type { AssumptionRegisterEntry } from "@alinamatrix/contracts";

// ============================================================
// Fixtures
// ============================================================

function makeEntry(overrides: Partial<AssumptionRegisterEntry> = {}): AssumptionRegisterEntry {
  return {
    id:        "11111111-0000-4000-8000-000000000001",
    projectId: "22222222-0000-4000-8000-000000000001",
    statement: "The study population is representative of the target demographic.",
    source:    "Fragment F-001, source version S-001",
    owner:     "Dr. Amin Azimi",
    expiry:    "2027-12-31",
    ...overrides,
  };
}

// ============================================================
// assertAssumptionRegistered — passes
// ============================================================

describe("assertAssumptionRegistered — passes", () => {
  it("passes when source, owner, and expiry are all present", () => {
    expect(() => assertAssumptionRegistered(makeEntry())).not.toThrow();
  });

  it("passes with a rationale (optional field)", () => {
    expect(() =>
      assertAssumptionRegistered(makeEntry({ rationale: "Reviewed in Q1." })),
    ).not.toThrow();
  });

  it("passes with a null rationale", () => {
    expect(() =>
      assertAssumptionRegistered(makeEntry({ rationale: null })),
    ).not.toThrow();
  });
});

// ============================================================
// assertAssumptionRegistered — fails
// ============================================================

describe("assertAssumptionRegistered — fails", () => {
  it("throws AssumptionRegisterError when source is missing", () => {
    const entry = makeEntry({ source: "" });
    expect(() => assertAssumptionRegistered(entry)).toThrow(AssumptionRegisterError);
  });

  it("throws AssumptionRegisterError when source is whitespace-only", () => {
    const entry = makeEntry({ source: "   " });
    expect(() => assertAssumptionRegistered(entry)).toThrow(AssumptionRegisterError);
  });

  it("throws AssumptionRegisterError when owner is missing", () => {
    const entry = makeEntry({ owner: "" });
    expect(() => assertAssumptionRegistered(entry)).toThrow(AssumptionRegisterError);
  });

  it("throws AssumptionRegisterError when owner is whitespace-only", () => {
    const entry = makeEntry({ owner: "  " });
    expect(() => assertAssumptionRegistered(entry)).toThrow(AssumptionRegisterError);
  });

  it("throws AssumptionRegisterError when expiry is missing", () => {
    const entry = makeEntry({ expiry: "" });
    expect(() => assertAssumptionRegistered(entry)).toThrow(AssumptionRegisterError);
  });

  it("throws AssumptionRegisterError when expiry is not an ISO date", () => {
    const entry = makeEntry({ expiry: "Dec 31 2027" });
    expect(() => assertAssumptionRegistered(entry)).toThrow(AssumptionRegisterError);
  });

  it("error carries the assumption id and missing fields", () => {
    const entry = makeEntry({ id: "33333333-0000-4000-8000-000000000001", source: "", owner: "" });
    try {
      assertAssumptionRegistered(entry);
    } catch (err) {
      expect(err).toBeInstanceOf(AssumptionRegisterError);
      expect((err as AssumptionRegisterError).assumptionId).toBe(
        "33333333-0000-4000-8000-000000000001",
      );
      expect((err as AssumptionRegisterError).missingFields).toContain("source");
      expect((err as AssumptionRegisterError).missingFields).toContain("owner");
    }
  });
});

// ============================================================
// assertAllAssumptionsRegistered
// ============================================================

describe("assertAllAssumptionsRegistered", () => {
  it("passes when all assumptions in a list are registered", () => {
    const entries = [makeEntry(), makeEntry({
      id: "44444444-0000-4000-8000-000000000001",
    })];
    expect(() => assertAllAssumptionsRegistered(entries)).not.toThrow();
  });

  it("throws when at least one assumption is unregistered", () => {
    const entries = [
      makeEntry(),
      makeEntry({
        id:      "55555555-0000-4000-8000-000000000001",
        source:  "",
        owner:   "",
      }),
    ];
    expect(() => assertAllAssumptionsRegistered(entries)).toThrow(AssumptionRegisterError);
  });

  it("passes on an empty list", () => {
    expect(() => assertAllAssumptionsRegistered([])).not.toThrow();
  });
});

// ============================================================
// checkAssumptionExpiry
// ============================================================

describe("checkAssumptionExpiry", () => {
  it("returns expired=false when expiry is after the reference date", () => {
    const entry = makeEntry({ expiry: "2027-12-31" });
    const result = checkAssumptionExpiry(entry, "2026-10-17");
    expect(result.expired).toBe(false);
    expect(result.expiryDate).toBe("2027-12-31");
    expect(result.referenceDate).toBe("2026-10-17");
  });

  it("returns expired=true when expiry is before the reference date", () => {
    const entry = makeEntry({ expiry: "2025-01-01" });
    const result = checkAssumptionExpiry(entry, "2026-10-17");
    expect(result.expired).toBe(true);
  });

  it("returns expired=false when expiry equals the reference date (still valid today)", () => {
    const entry = makeEntry({ expiry: "2026-10-17" });
    const result = checkAssumptionExpiry(entry, "2026-10-17");
    expect(result.expired).toBe(false);
  });
});

// ============================================================
// assertAssumptionNotExpired
// ============================================================

describe("assertAssumptionNotExpired", () => {
  it("does not throw when the assumption is not expired", () => {
    const entry = makeEntry({ expiry: "2027-12-31" });
    expect(() => assertAssumptionNotExpired(entry, "2026-10-17")).not.toThrow();
  });

  it("throws AssumptionRegisterError when the assumption is expired", () => {
    const entry = makeEntry({ expiry: "2025-01-01" });
    expect(() => assertAssumptionNotExpired(entry, "2026-10-17"))
      .toThrow(AssumptionRegisterError);
  });
});

// ============================================================
// filterExpiredAssumptions
// ============================================================

describe("filterExpiredAssumptions", () => {
  it("returns only non-expired assumptions", () => {
    const entries = [
      makeEntry({ id: "a1a1a1a1-0000-4000-8000-000000000001", expiry: "2027-12-31" }),
      makeEntry({ id: "b2b2b2b2-0000-4000-8000-000000000002", expiry: "2025-01-01" }),
      makeEntry({ id: "c3c3c3c3-0000-4000-8000-000000000003", expiry: "2028-06-15" }),
    ];
    const filtered = filterExpiredAssumptions(entries, "2026-10-17");
    expect(filtered).toHaveLength(2);
    expect(filtered[0]!.id).toBe("a1a1a1a1-0000-4000-8000-000000000001");
    expect(filtered[1]!.id).toBe("c3c3c3c3-0000-4000-8000-000000000003");
  });

  it("returns all when none are expired", () => {
    const entries = [
      makeEntry({ id: "a1a1a1a1-0000-4000-8000-000000000001", expiry: "2027-12-31" }),
    ];
    expect(filterExpiredAssumptions(entries, "2026-10-17")).toHaveLength(1);
  });

  it("returns empty when all are expired", () => {
    const entries = [
      makeEntry({ id: "a1a1a1a1-0000-4000-8000-000000000001", expiry: "2025-01-01" }),
    ];
    expect(filterExpiredAssumptions(entries, "2026-10-17")).toHaveLength(0);
  });
});
