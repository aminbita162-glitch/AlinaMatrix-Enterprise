/**
 * Unit tests for negative evidence recording — Level Up Phase D (Unit 4).
 *
 * Directive Level Up Phase D:
 *   "Negative evidence: absence in the source is recorded, not left silent."
 *
 * Covers:
 *   - recordNegativeEvidence — produces a record with a non-empty note
 *   - recordNegativeEvidence — rejects a blank note (silence is a violation)
 *   - recordNegativeEvidence — rejects a blank expectedLabel / sourceVersionId
 *   - assertNegativeEvidenceRecorded — validates an existing record
 *   - buildAbsenceNote — produces a standard note string
 *   - recordFragmentAbsence — convenience wrapper
 *   - absencesForSource — filters by source version
 *   - recordHash is deterministic
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import {
  NegativeEvidenceRecordError,
  recordNegativeEvidence,
  assertNegativeEvidenceRecorded,
  buildAbsenceNote,
  recordFragmentAbsence,
  absencesForSource,
} from "./negative-evidence.js";
import type { NegativeEvidenceRecord } from "./negative-evidence.js";

// ============================================================
// Fixtures
// ============================================================

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    id:              "dddddddd-0000-4000-8000-000000000001",
    claimId:         "cccccccc-0000-4000-8000-000000000001",
    projectId:       "pppppppp-0000-4000-8000-000000000001",
    sourceVersionId: "ssssssss-0000-4000-8000-000000000001",
    expectedLabel:   "study size table",
    expectedKind:    "fragment_absent" as const,
    note:            "No table matching the study size was found in the source.",
    ...overrides,
  };
}

// ============================================================
// recordNegativeEvidence — produces a record
// ============================================================

describe("recordNegativeEvidence — produces a record", () => {
  it("produces a record with the given fields", () => {
    const record = recordNegativeEvidence(makeInput());
    expect(record.id).toBe("dddddddd-0000-4000-8000-000000000001");
    expect(record.claimId).toBe("cccccccc-0000-4000-8000-000000000001");
    expect(record.projectId).toBe("pppppppp-0000-4000-8000-000000000001");
    expect(record.sourceVersionId).toBe("ssssssss-0000-4000-8000-000000000001");
    expect(record.expectedLabel).toBe("study size table");
    expect(record.expectedKind).toBe("fragment_absent");
    expect(record.note).toContain("No table matching");
    expect(record.recordHash).toHaveLength(64);
  });

  it("accepts a null claimId", () => {
    const record = recordNegativeEvidence(makeInput({ claimId: null }));
    expect(record.claimId).toBeNull();
  });

  it("accepts a missing claimId (defaults to null)", () => {
    const input = makeInput();
    delete (input as Record<string, unknown>).claimId;
    const record = recordNegativeEvidence(input);
    expect(record.claimId).toBeNull();
  });

  it("does not mutate the input", () => {
    const input = makeInput();
    const snapshot = JSON.parse(JSON.stringify(input));
    recordNegativeEvidence(input);
    expect(input).toEqual(snapshot);
  });
});

// ============================================================
// recordNegativeEvidence — rejects silence
// ============================================================

describe("recordNegativeEvidence — rejects silence", () => {
  it("throws NegativeEvidenceRecordError when note is empty", () => {
    expect(() => recordNegativeEvidence(makeInput({ note: "" })))
      .toThrow(NegativeEvidenceRecordError);
  });

  it("throws NegativeEvidenceRecordError when note is whitespace-only", () => {
    expect(() => recordNegativeEvidence(makeInput({ note: "   " })))
      .toThrow(NegativeEvidenceRecordError);
  });

  it("throws when expectedLabel is empty", () => {
    expect(() => recordNegativeEvidence(makeInput({ expectedLabel: "" })))
      .toThrow(NegativeEvidenceRecordError);
  });

  it("throws when sourceVersionId is empty", () => {
    expect(() => recordNegativeEvidence(makeInput({ sourceVersionId: "" })))
      .toThrow(NegativeEvidenceRecordError);
  });

  it("throws when projectId is empty", () => {
    expect(() => recordNegativeEvidence(makeInput({ projectId: "" })))
      .toThrow(NegativeEvidenceRecordError);
  });

  it("error field is 'note' when the note is blank", () => {
    try {
      recordNegativeEvidence(makeInput({ note: "" }));
    } catch (err) {
      expect(err).toBeInstanceOf(NegativeEvidenceRecordError);
      expect((err as NegativeEvidenceRecordError).field).toBe("note");
    }
  });
});

// ============================================================
// recordHash — determinism
// ============================================================

describe("recordHash — determinism", () => {
  it("is deterministic for the same inputs", () => {
    const a = recordNegativeEvidence(makeInput());
    const b = recordNegativeEvidence(makeInput());
    expect(a.recordHash).toBe(b.recordHash);
  });

  it("differs when the expectedLabel differs", () => {
    const a = recordNegativeEvidence(makeInput({ expectedLabel: "study size table" }));
    const b = recordNegativeEvidence(makeInput({ expectedLabel: "adverse events table" }));
    expect(a.recordHash).not.toBe(b.recordHash);
  });

  it("differs when the sourceVersionId differs", () => {
    const a = recordNegativeEvidence(makeInput({ sourceVersionId: "s1-0000-4000-8000-000000000001" }));
    const b = recordNegativeEvidence(makeInput({ sourceVersionId: "s2-0000-4000-8000-000000000002" }));
    expect(a.recordHash).not.toBe(b.recordHash);
  });
});

// ============================================================
// assertNegativeEvidenceRecorded
// ============================================================

describe("assertNegativeEvidenceRecorded", () => {
  it("does not throw for a valid record", () => {
    const record: NegativeEvidenceRecord = recordNegativeEvidence(makeInput());
    expect(() => assertNegativeEvidenceRecorded(record)).not.toThrow();
  });

  it("throws when the note is blank", () => {
    const record: NegativeEvidenceRecord = {
      ...recordNegativeEvidence(makeInput()),
      note: "",
    };
    expect(() => assertNegativeEvidenceRecorded(record)).toThrow(NegativeEvidenceRecordError);
  });

  it("throws when expectedLabel is blank", () => {
    const record: NegativeEvidenceRecord = {
      ...recordNegativeEvidence(makeInput()),
      expectedLabel: "",
    };
    expect(() => assertNegativeEvidenceRecorded(record)).toThrow(NegativeEvidenceRecordError);
  });
});

// ============================================================
// buildAbsenceNote
// ============================================================

describe("buildAbsenceNote", () => {
  it("produces a note that mentions the source version and expected label", () => {
    const note = buildAbsenceNote("ssssssss-0000-4000-8000-000000000001", "study size table");
    expect(note).toContain("ssssssss-0000-4000-8000-000000000001");
    expect(note).toContain("study size table");
    expect(note).toContain("no matching fragment");
  });

  it("is non-empty for any non-empty inputs", () => {
    expect(buildAbsenceNote("src-1", "label-1").length).toBeGreaterThan(20);
  });
});

// ============================================================
// recordFragmentAbsence
// ============================================================

describe("recordFragmentAbsence", () => {
  it("produces a record with expectedKind 'fragment_absent' and a built note", () => {
    const record = recordFragmentAbsence({
      id:              "dddddddd-0000-4000-8000-000000000001",
      projectId:       "pppppppp-0000-4000-8000-000000000001",
      sourceVersionId: "ssssssss-0000-4000-8000-000000000001",
      expectedLabel:   "adverse events table",
    });
    expect(record.expectedKind).toBe("fragment_absent");
    expect(record.note).toContain("adverse events table");
    expect(record.note).toContain("no matching fragment");
    expect(record.recordHash).toHaveLength(64);
  });

  it("accepts an optional claimId", () => {
    const record = recordFragmentAbsence({
      id:              "dddddddd-0000-4000-8000-000000000001",
      claimId:         "cccccccc-0000-4000-8000-000000000001",
      projectId:       "pppppppp-0000-4000-8000-000000000001",
      sourceVersionId: "ssssssss-0000-4000-8000-000000000001",
      expectedLabel:   "adverse events table",
    });
    expect(record.claimId).toBe("cccccccc-0000-4000-8000-000000000001");
  });
});

// ============================================================
// absencesForSource
// ============================================================

describe("absencesForSource", () => {
  it("returns only records for the given source version", () => {
    const records: NegativeEvidenceRecord[] = [
      recordFragmentAbsence({
        id: "d1-0000-4000-8000-000000000001",
        projectId: "p-1",
        sourceVersionId: "src-A",
        expectedLabel: "table A",
      }),
      recordFragmentAbsence({
        id: "d2-0000-4000-8000-000000000002",
        projectId: "p-1",
        sourceVersionId: "src-B",
        expectedLabel: "table B",
      }),
      recordFragmentAbsence({
        id: "d3-0000-4000-8000-000000000003",
        projectId: "p-1",
        sourceVersionId: "src-A",
        expectedLabel: "table C",
      }),
    ];
    const forA = absencesForSource(records, "src-A");
    expect(forA).toHaveLength(2);
    expect(forA.every((r) => r.sourceVersionId === "src-A")).toBe(true);
  });

  it("returns empty when no records match", () => {
    const records: NegativeEvidenceRecord[] = [
      recordFragmentAbsence({
        id: "d1-0000-4000-8000-000000000001",
        projectId: "p-1",
        sourceVersionId: "src-A",
        expectedLabel: "table A",
      }),
    ];
    expect(absencesForSource(records, "src-Z")).toHaveLength(0);
  });
});
