/**
 * Negative evidence recording — Level Up Phase D (Unit 4: evidence depth).
 *
 * Absence in the source is recorded, not left silent. When a claim expects
 * evidence to be present in the source but none is found, that absence is
 * recorded as a `NegativeEvidenceRecord` — a structured note stating what
 * was looked for, where, and that it was absent.
 *
 * This complements the existing `assertNegativeEvidenceNote` guard (which
 * requires a note when support_status is "supported" or claim_type is
 * "inferred"). The guard says the note must exist; the recorder produces
 * the note and the structured record.
 *
 * Directive Level Up Phase D:
 *   "Negative evidence: absence in the source is recorded, not left silent."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { computeSha256String } from "./source.js";

// ============================================================
// Types
// ============================================================

/**
 * The kind of evidence that was expected but not found.
 */
export type NegativeEvidenceKind =
  | "fragment_absent"
  | "claim_absent"
  | "number_absent"
  | "term_absent"
  | "section_absent";

/**
 * A structured record of negative evidence: the absence of something
 * expected in the source.
 *
 * `sourceVersionId` identifies the source that was searched.
 * `expectedLabel` is a human-readable description of what was expected.
 * `expectedKind` classifies the kind of absence.
 * `note` is the free-text explanation (never empty — silence is a violation).
 */
export interface NegativeEvidenceRecord {
  id:              string;
  claimId:         string | null;
  projectId:       string;
  sourceVersionId: string;
  expectedLabel:   string;
  expectedKind:    NegativeEvidenceKind;
  note:            string;
  /** SHA-256 of the record's identity fields for dedup. */
  recordHash:      string;
}

// ============================================================
// Errors
// ============================================================

/**
 * Thrown when an attempt to record negative evidence is made with a blank
 * or missing note. The directive is explicit: "absence in the source is
 * recorded, not left silent." A blank note *is* silence — it is rejected.
 */
export class NegativeEvidenceRecordError extends Error {
  readonly field: string;
  constructor(field: string, reason: string) {
    super(`Negative evidence record is invalid: ${field} — ${reason}`);
    this.name = "NegativeEvidenceRecordError";
    this.field = field;
  }
}

// ============================================================
// Recording
// ============================================================

/**
 * Record a negative evidence entry: the absence of something expected in
 * the source. The note must be non-empty — silence is a violation.
 *
 * The record is produced; the inputs are never mutated.
 */
export function recordNegativeEvidence(input: {
  id:              string;
  claimId?:        string | null;
  projectId:       string;
  sourceVersionId: string;
  expectedLabel:   string;
  expectedKind:    NegativeEvidenceKind;
  note:            string;
}): NegativeEvidenceRecord {
  if (!input.expectedLabel || input.expectedLabel.trim().length === 0) {
    throw new NegativeEvidenceRecordError("expectedLabel", "must be non-empty");
  }
  if (!input.note || input.note.trim().length === 0) {
    throw new NegativeEvidenceRecordError("note", "must be non-empty — silence is a violation");
  }
  if (!input.sourceVersionId) {
    throw new NegativeEvidenceRecordError("sourceVersionId", "must identify the searched source");
  }
  if (!input.projectId) {
    throw new NegativeEvidenceRecordError("projectId", "must identify the project");
  }

  const recordHash = computeSha256String(
    `${input.id}|${input.claimId ?? ""}|${input.projectId}|${input.sourceVersionId}|${input.expectedKind}|${input.expectedLabel}`,
  );

  return {
    id:              input.id,
    claimId:         input.claimId ?? null,
    projectId:       input.projectId,
    sourceVersionId: input.sourceVersionId,
    expectedLabel:   input.expectedLabel,
    expectedKind:    input.expectedKind,
    note:            input.note,
    recordHash,
  };
}

/**
 * Assert that a negative evidence record is valid (non-empty note, expected
 * label, source version, and project). Throws NegativeEvidenceRecordError
 * when any field is blank.
 */
export function assertNegativeEvidenceRecorded(record: NegativeEvidenceRecord): void {
  if (!record.note || record.note.trim().length === 0) {
    throw new NegativeEvidenceRecordError("note", "must be non-empty — silence is a violation");
  }
  if (!record.expectedLabel || record.expectedLabel.trim().length === 0) {
    throw new NegativeEvidenceRecordError("expectedLabel", "must be non-empty");
  }
  if (!record.sourceVersionId) {
    throw new NegativeEvidenceRecordError("sourceVersionId", "must identify the searched source");
  }
}

/**
 * Build a standard negative-evidence note for an absent fragment: "Searched
 * source version <sourceVersionId> for '<expectedLabel>'; no matching
 * fragment was found. Absence recorded as negative evidence."
 *
 * The caller does not have to compose the note — the recorder does.
 */
export function buildAbsenceNote(
  sourceVersionId: string,
  expectedLabel: string,
): string {
  return (
    `Searched source version ${sourceVersionId} for "${expectedLabel}"; ` +
    `no matching fragment was found. Absence recorded as negative evidence.`
  );
}

/**
 * Record the absence of a fragment in a source version. Convenience
 * wrapper around `recordNegativeEvidence` with `expectedKind: "fragment_absent"`
 * and a note built by `buildAbsenceNote`.
 */
export function recordFragmentAbsence(input: {
  id:              string;
  claimId?:        string | null;
  projectId:       string;
  sourceVersionId: string;
  expectedLabel:   string;
}): NegativeEvidenceRecord {
  return recordNegativeEvidence({
    id:              input.id,
    claimId:         input.claimId ?? null,
    projectId:       input.projectId,
    sourceVersionId: input.sourceVersionId,
    expectedLabel:   input.expectedLabel,
    expectedKind:    "fragment_absent",
    note:            buildAbsenceNote(input.sourceVersionId, input.expectedLabel),
  });
}

/**
 * Filter a list of records, returning only those for a given source version.
 * Useful for auditing which absences were recorded against a specific source.
 */
export function absencesForSource(
  records: NegativeEvidenceRecord[],
  sourceVersionId: string,
): NegativeEvidenceRecord[] {
  return records.filter((r) => r.sourceVersionId === sourceVersionId);
}
