/**
 * Release gate and label lifecycle — Phase 9 (Unit 1: release gate).
 *
 * Covers:
 *   - ReleaseLabel — DRAFT, INTERNAL_REVIEW, APPROVED, PUBLISHED, ARCHIVED, REVOKED.
 *   - checkReleaseGate — returns { passed, reasons }. Blocks when:
 *       validations not passed, critical findings > 0, four-eyes not satisfied,
 *       manifest missing, checksum missing, source versions empty, version pins
 *       missing, or source job is FAILED_RETRYABLE / FAILED_TERMINAL / CANCELLED.
 *   - assertReleaseGate — throws ReleaseGateError when the gate fails.
 *   - Label transition guards (isLegalLabelTransition / assertLegalLabelTransition).
 *
 * Directive Phase 9:
 *   "Release function requires: validations pass, critical findings = 0,
 *    four-eyes approvals, manifest, checksum, source versions, version pins,
 *    source job not failed or cancelled."
 *   "Labels: DRAFT, INTERNAL_REVIEW, APPROVED, PUBLISHED, ARCHIVED, REVOKED."
 *
 * Status: Enterprise Candidate — Active Development
 */
import type {
  ReleaseLabel,
  ReleaseGateInput,
  ReleaseGateResult,
} from "@alinamatrix/contracts";

// ============================================================
// Release labels
// ============================================================

export type { ReleaseLabel } from "@alinamatrix/contracts";

/** Allowed forward label transitions. */
const ALLOWED_LABEL_TRANSITIONS: Readonly<Record<ReleaseLabel, readonly ReleaseLabel[]>> = {
  DRAFT:           ["INTERNAL_REVIEW", "ARCHIVED"],
  INTERNAL_REVIEW: ["APPROVED", "DRAFT", "ARCHIVED"],
  APPROVED:         ["PUBLISHED", "ARCHIVED"],
  PUBLISHED:        ["ARCHIVED", "REVOKED"],
  ARCHIVED:         ["REVOKED"],
  REVOKED:          [],
};

export class IllegalLabelError extends Error {
  constructor(from: ReleaseLabel, to: ReleaseLabel) {
    super(`Illegal release label transition: ${from} -> ${to}`);
    this.name = "IllegalLabelError";
  }
}

export function isLegalLabelTransition(from: ReleaseLabel, to: ReleaseLabel): boolean {
  return (ALLOWED_LABEL_TRANSITIONS[from] as readonly string[]).includes(to);
}

export function assertLegalLabelTransition(from: ReleaseLabel, to: ReleaseLabel): void {
  if (!isLegalLabelTransition(from, to)) {
    throw new IllegalLabelError(from, to);
  }
}

// ============================================================
// Release gate
// ============================================================

export class ReleaseGateError extends Error {
  readonly reasons: string[];
  constructor(reasons: string[]) {
    super(`Release gate failed: ${reasons.join("; ")}`);
    this.name = "ReleaseGateError";
    this.reasons = reasons;
  }
}

/** States that block release — the source job must not be failed or cancelled. */
const BLOCKING_SOURCE_JOB_STATES: ReadonlySet<string> = new Set([
  "FAILED_RETRYABLE",
  "FAILED_TERMINAL",
  "CANCELLED",
]);

/**
 * Check the release gate. Returns { passed, reasons }.
 *
 * The gate blocks when any of these conditions is true:
 *   - validationsPassed === false
 *   - criticalFindings > 0
 *   - fourEyesSatisfied === false
 *   - manifestPresent === false
 *   - checksumPresent === false
 *   - sourceVersionIds is empty
 *   - versionPinsPresent === false
 *   - sourceJobState is FAILED_RETRYABLE, FAILED_TERMINAL, or CANCELLED
 */
export function checkReleaseGate(input: ReleaseGateInput): ReleaseGateResult {
  const reasons: string[] = [];

  if (!input.validationsPassed) {
    reasons.push("validations did not pass");
  }
  if (input.criticalFindings > 0) {
    reasons.push(`critical findings count is ${input.criticalFindings} (must be 0)`);
  }
  if (!input.fourEyesSatisfied) {
    reasons.push("four-eyes not satisfied: no independent approver");
  }
  if (!input.manifestPresent) {
    reasons.push("manifest missing");
  }
  if (!input.checksumPresent) {
    reasons.push("checksum (html sha256) missing");
  }
  if (input.sourceVersionIds.length === 0) {
    reasons.push("source version ids empty");
  }
  if (!input.versionPinsPresent) {
    reasons.push("version pins missing (prompt, model, schema, policy)");
  }
  if (BLOCKING_SOURCE_JOB_STATES.has(input.sourceJobState)) {
    reasons.push(`source job state is ${input.sourceJobState} (must not be failed or cancelled)`);
  }

  return { passed: reasons.length === 0, reasons };
}

/**
 * Assert the release gate. Throws ReleaseGateError when the gate fails.
 */
export function assertReleaseGate(input: ReleaseGateInput): void {
  const result = checkReleaseGate(input);
  if (!result.passed) {
    throw new ReleaseGateError(result.reasons);
  }
}
