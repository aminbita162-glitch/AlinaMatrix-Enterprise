/**
 * Numeric reconciliation — Level Up Phase D (Unit 3: evidence depth).
 *
 * Numbers in the document are checked against the source; differences are
 * recorded, not corrected. The reconciler compares a numeric value in a
 * claim against the source-of-truth value, records any discrepancy as a
 * `NumericReconciliationRecord`, and never mutates the inputs.
 *
 * Directive Level Up Phase D:
 *   "Numeric reconciliation: numbers in the document are checked against
 *    the source; differences are recorded, not corrected."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { computeSha256String } from "./source.js";

// ============================================================
// Types
// ============================================================

/**
 * A single numeric value extracted from a document claim, paired with its
 * source-of-truth value.
 */
export interface NumericPair {
  /** The claim ID that carries the document number. */
  claimId:        string;
  /** A human-readable label for what the number measures (e.g. "study size"). */
  label:          string;
  /** The value as it appears in the document (the claim). */
  documentValue:  number;
  /** The value from the source (the source of truth). */
  sourceValue:    number;
  /** Optional unit string (e.g. "patients", "kg"). */
  unit?:          string | null;
}

/**
 * The result of reconciling a single numeric pair.
 *
 * `difference` is `documentValue - sourceValue` (never the other way).
 * `matches` is true when the absolute difference is 0.
 */
export interface NumericReconciliationRecord {
  claimId:       string;
  label:         string;
  documentValue: number;
  sourceValue:   number;
  difference:    number;
  matches:       boolean;
  unit:          string | null;
  /** SHA-256 of the record's identity fields for dedup. */
  recordHash:     string;
}

// ============================================================
// Reconciliation
// ============================================================

/**
 * Reconcile a single numeric pair: compare the document value against the
 * source value and record the difference. The inputs are never mutated.
 *
 * Returns a NumericReconciliationRecord with `matches: false` when the
 * values differ, `matches: true` when they are equal.
 */
export function reconcileNumber(pair: NumericPair): NumericReconciliationRecord {
  const difference = pair.documentValue - pair.sourceValue;
  const matches = pair.documentValue === pair.sourceValue;

  const unitStr = pair.unit ?? null;
  const recordHash = computeSha256String(
    `${pair.claimId}|${pair.label}|${pair.documentValue}|${pair.sourceValue}|${unitStr ?? ""}`,
  );

  return {
    claimId:       pair.claimId,
    label:         pair.label,
    documentValue: pair.documentValue,
    sourceValue:   pair.sourceValue,
    difference,
    matches,
    unit:          unitStr,
    recordHash,
  };
}

/**
 * Reconcile a list of numeric pairs. Returns one record per pair, in order.
 * Differences are recorded, not corrected — the inputs are never mutated.
 */
export function reconcileNumbers(pairs: NumericPair[]): NumericReconciliationRecord[] {
  return pairs.map(reconcileNumber);
}

/**
 * Filter a list of reconciliation records, returning only those with
 * a discrepancy (matches: false). A discrepancy is recorded, not
 * corrected — the caller decides what to do with it.
 */
export function discrepanciesOnly(
  records: NumericReconciliationRecord[],
): NumericReconciliationRecord[] {
  return records.filter((r) => !r.matches);
}

/**
 * Assert that all numeric pairs reconcile (no discrepancies). Throws
 * NumericReconciliationError when any pair has a non-zero difference.
 */
export class NumericReconciliationError extends Error {
  readonly discrepancies: NumericReconciliationRecord[];
  constructor(discrepancies: NumericReconciliationRecord[]) {
    super(
      `Numeric reconciliation failed: ${discrepancies.length} discrepancy(ies) recorded — ` +
      discrepancies
        .map((d) => `${d.label} (document: ${d.documentValue}, source: ${d.sourceValue}, diff: ${d.difference})`)
        .join("; "),
    );
    this.name = "NumericReconciliationError";
    this.discrepancies = discrepancies;
  }
}

/**
 * Assert that all numeric pairs reconcile (no discrepancies). Throws
 * NumericReconciliationError when any pair has a non-zero difference.
 *
 * Differences are recorded in the error, not corrected.
 */
export function assertAllNumbersReconcile(pairs: NumericPair[]): void {
  const records = reconcileNumbers(pairs);
  const discrepancies = discrepanciesOnly(records);
  if (discrepancies.length > 0) {
    throw new NumericReconciliationError(discrepancies);
  }
}
