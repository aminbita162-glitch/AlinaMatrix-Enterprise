/**
 * Assumption register — Level Up Phase D (Unit 1: evidence depth).
 *
 * The assumption register requires that every assumption carries a source
 * (where it comes from), an owner (who is responsible), and an expiry
 * (when it stops being trusted). An assumption missing any of these is
 * a register violation, not a valid assumption with a blank field.
 *
 * Directive Level Up Phase D:
 *   "Assumption register: each assumption has source, owner, and expiry."
 *
 * Status: Enterprise Candidate — Active Development
 */
import type { AssumptionRegisterEntry, AssumptionExpiryResult } from "@alinamatrix/contracts";

// ============================================================
// Errors
// ============================================================

/**
 * Thrown when an assumption is missing its source, owner, or expiry, or
 * when any of those fields is blank / malformed.
 */
export class AssumptionRegisterError extends Error {
  readonly assumptionId: string;
  readonly missingFields: string[];
  constructor(assumptionId: string, missingFields: string[]) {
    super(
      `Assumption ${assumptionId} is not registered: missing ${missingFields.join(", ")}.`,
    );
    this.name = "AssumptionRegisterError";
    this.assumptionId = assumptionId;
    this.missingFields = missingFields;
  }
}

// ============================================================
// Registration validation
// ============================================================

/**
 * Assert that an assumption is properly registered: it has a non-empty
 * source, a non-empty owner, and a valid ISO-date expiry.
 *
 * Throws AssumptionRegisterError when any field is missing or blank.
 */
export function assertAssumptionRegistered(entry: AssumptionRegisterEntry): void {
  const missing: string[] = [];

  if (!entry.source || entry.source.trim().length === 0) {
    missing.push("source");
  }
  if (!entry.owner || entry.owner.trim().length === 0) {
    missing.push("owner");
  }
  if (!entry.expiry || entry.expiry.trim().length === 0) {
    missing.push("expiry");
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.expiry)) {
    missing.push("expiry (must be ISO date YYYY-MM-DD)");
  }

  if (missing.length > 0) {
    throw new AssumptionRegisterError(entry.id, missing);
  }
}

/**
 * Assert that every assumption in a list is registered. Collects all
 * violations and throws a single error listing every unregistered
 * assumption, rather than failing on the first.
 */
export function assertAllAssumptionsRegistered(
  entries: AssumptionRegisterEntry[],
): void {
  const violations: { id: string; missing: string[] }[] = [];

  for (const entry of entries) {
    const missing: string[] = [];
    if (!entry.source || entry.source.trim().length === 0) missing.push("source");
    if (!entry.owner || entry.owner.trim().length === 0) missing.push("owner");
    if (!entry.expiry || !/^\d{4}-\d{2}-\d{2}$/.test(entry.expiry)) {
      missing.push("expiry");
    }
    if (missing.length > 0) {
      violations.push({ id: entry.id, missing });
    }
  }

  if (violations.length > 0) {
    throw new AssumptionRegisterError(
      violations[0]!.id,
      violations.flatMap((v) => v.missing),
    );
  }
}

// ============================================================
// Expiry check
// ============================================================

/**
 * Check whether an assumption has expired relative to a reference date.
 *
 * Returns { expired, expiryDate, referenceDate }.
 * An assumption whose expiry is in the past relative to the reference date
 * is expired and must be re-validated or retired.
 */
export function checkAssumptionExpiry(
  entry: AssumptionRegisterEntry,
  referenceDate: string,
): AssumptionExpiryResult {
  // Reference date must also be a valid ISO date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
    throw new Error(`Reference date must be ISO format YYYY-MM-DD, got: ${referenceDate}`);
  }
  return {
    assumptionId:  entry.id,
    expired:       entry.expiry < referenceDate,
    expiryDate:   entry.expiry,
    referenceDate,
  };
}

/**
 * Assert that an assumption has not expired. Throws AssumptionRegisterError
 * when the expiry is in the past relative to the reference date.
 */
export function assertAssumptionNotExpired(
  entry: AssumptionRegisterEntry,
  referenceDate: string,
): void {
  const result = checkAssumptionExpiry(entry, referenceDate);
  if (result.expired) {
    throw new AssumptionRegisterError(entry.id, [
      `expired (${entry.expiry} < ${referenceDate})`,
    ]);
  }
}

/**
 * Filter a list of assumptions, returning only those that have not
 * expired relative to the reference date. Does not throw — the caller
 * decides whether expired assumptions block the workflow.
 */
export function filterExpiredAssumptions(
  entries: AssumptionRegisterEntry[],
  referenceDate: string,
): AssumptionRegisterEntry[] {
  return entries.filter((e) => !checkAssumptionExpiry(e, referenceDate).expired);
}
