/**
 * Quote-lock release gate — Level Up Phase D (Unit 2: evidence depth).
 *
 * A claim without a valid quote cannot reach RELEASED. The quote-lock
 * release gate verifies that every witnessed claim referenced by a
 * build has a valid quote-lock (quote is an exact fragment substring and
 * the supplied hash matches). If any witnessed claim's quote-lock is
 * invalid or absent, the release is blocked.
 *
 * Directive Level Up Phase D:
 *   "Quote-lock: a claim without a valid quote cannot reach RELEASED."
 *
 * Status: Enterprise Candidate — Active Development
 */
import type { ReleaseGateInput } from "@alinamatrix/contracts";

// ============================================================
// Types
// ============================================================

/**
 * A witnessed claim that must pass quote-lock before release.
 *
 * `claimType` must be "witnessed" for quote-lock to apply; non-witnessed
 * claims are skipped (they do not carry quotes).
 */
export interface QuoteLockClaimRef {
  claimId:    string;
  claimType:   "witnessed" | "inferred" | "assumption";
  /** True when the claim has a quote-lock that has been validated. */
  quoteLocked: boolean;
}

/**
 * The result of checking the quote-lock release gate.
 */
export interface QuoteLockReleaseResult {
  passed:   boolean;
  reasons:  string[];
  /** The IDs of witnessed claims that failed quote-lock. */
  failedClaimIds: string[];
}

// ============================================================
// Errors
// ============================================================

/**
 * Thrown when a witnessed claim's quote-lock is invalid or absent and
 * the release gate blocks.
 */
export class QuoteLockReleaseError extends Error {
  readonly reasons: string[];
  readonly failedClaimIds: string[];
  constructor(reasons: string[], failedClaimIds: string[]) {
    super(`Quote-lock release gate failed: ${reasons.join("; ")}`);
    this.name = "QuoteLockReleaseError";
    this.reasons = reasons;
    this.failedClaimIds = failedClaimIds;
  }
}

// ============================================================
// Gate
// ============================================================

/**
 * Check the quote-lock release gate. A claim without a valid quote cannot
 * reach RELEASED.
 *
 * The gate blocks when:
 *   - A witnessed claim's quoteLocked is false (no valid quote-lock).
 *   - The release input's source job state is RELEASED and a witnessed
 *     claim is not quote-locked (the release already happened without
 *     the lock).
 */
export function checkQuoteLockReleaseGate(
  claims: QuoteLockClaimRef[],
  releaseInput?: ReleaseGateInput,
): QuoteLockReleaseResult {
  const reasons: string[] = [];
  const failedClaimIds: string[] = [];

  for (const claim of claims) {
    if (claim.claimType !== "witnessed") continue;

    if (!claim.quoteLocked) {
      reasons.push(
        `Witnessed claim ${claim.claimId} has no valid quote-lock — a claim without a valid quote cannot reach RELEASED.`,
      );
      failedClaimIds.push(claim.claimId);
    }
  }

  // If the release is RELEASED and any witnessed claim is not locked, the
  // release is blocked — even if the release gate itself passed otherwise.
  if (releaseInput && releaseInput.sourceJobState === "RELEASED" && failedClaimIds.length > 0) {
    reasons.push(
      `Release source job state is RELEASED but ${failedClaimIds.length} witnessed claim(s) lack a valid quote-lock.`,
    );
  }

  return {
    passed: failedClaimIds.length === 0,
    reasons,
    failedClaimIds,
  };
}

/**
 * Assert the quote-lock release gate. Throws QuoteLockReleaseError when
 * any witnessed claim lacks a valid quote-lock.
 */
export function assertQuoteLockReleaseGate(
  claims: QuoteLockClaimRef[],
  releaseInput?: ReleaseGateInput,
): void {
  const result = checkQuoteLockReleaseGate(claims, releaseInput);
  if (!result.passed) {
    throw new QuoteLockReleaseError(result.reasons, result.failedClaimIds);
  }
}
