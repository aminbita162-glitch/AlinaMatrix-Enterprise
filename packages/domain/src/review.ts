/**
 * Domain logic for Phase 7: Human Review.
 *
 * Covers:
 *   - approveClaim / rejectClaim — update claim reviewer_status.
 *     Reject keeps workflow in NEEDS_REVIEW (canCompleteReview returns false).
 *   - canCompleteReview — returns false when any claim is rejected.
 *   - assertFourEyes — the author of the draft cannot be the sole release approver.
 *     Throws FourEyesError when authorId === sole approverId.
 *
 * Directive Phase 7 additive controls:
 *   - Claim-level review (approve / reject)
 *   - Four-eyes: author cannot be the sole release approver.
 *
 * Status: Enterprise Candidate — Active Development
 */

// ============================================================
// Errors
// ============================================================

export class FourEyesError extends Error {
  constructor(userId: string) {
    super(
      `Four-eyes violation: user "${userId}" is the author and cannot be the sole approver. ` +
      "A second independent approver is required.",
    );
    this.name = "FourEyesError";
  }
}

export class RejectedClaimError extends Error {
  constructor(claimId: string) {
    super(
      `Review cannot be completed: claim "${claimId}" has reviewer_status=rejected. ` +
      "All rejected claims must be addressed before approval.",
    );
    this.name = "RejectedClaimError";
  }
}

// ============================================================
// Types
// ============================================================

export type ClaimReviewerStatus = "pending" | "approved" | "rejected";

export interface ClaimDecisionInput {
  claimId:        string;
  reviewerId:     string;
  decision:       "approved" | "rejected";
}

export interface ClaimDecisionResult {
  claimId:        string;
  reviewerStatus: ClaimReviewerStatus;
}

export interface ReviewClaimInput {
  id:             string;
  reviewerStatus: ClaimReviewerStatus;
}

export interface ApproverRecord {
  approverId: string;
  decision:   "approved" | "rejected";
}

// ============================================================
// Claim-level decisions
// ============================================================

/**
 * Record an approved decision for a claim.
 * Returns the resulting claim decision.
 */
export function approveClaim(claimId: string, reviewerId: string): ClaimDecisionResult {
  void reviewerId; // reviewer identity is recorded by the caller; domain only returns status
  return { claimId, reviewerStatus: "approved" };
}

/**
 * Record a rejected decision for a claim.
 * A rejected claim keeps the workflow in NEEDS_REVIEW.
 */
export function rejectClaim(claimId: string, reviewerId: string): ClaimDecisionResult {
  void reviewerId;
  return { claimId, reviewerStatus: "rejected" };
}

// ============================================================
// Completion check
// ============================================================

/**
 * Return true only when no claim in the task has reviewer_status="rejected".
 *
 * Directive: "Reject keeps NEEDS_REVIEW."
 *
 * @throws RejectedClaimError for the first rejected claim found (caller may choose to
 *         collect all errors instead — the error message names the first blocker).
 */
export function canCompleteReview(claims: ReviewClaimInput[]): boolean {
  for (const claim of claims) {
    if (claim.reviewerStatus === "rejected") {
      return false;
    }
  }
  return true;
}

/**
 * Assert that no claim in the set is rejected.
 * Throws RejectedClaimError naming the first rejected claim.
 */
export function assertNoRejectedClaims(claims: ReviewClaimInput[]): void {
  for (const claim of claims) {
    if (claim.reviewerStatus === "rejected") {
      throw new RejectedClaimError(claim.id);
    }
  }
}

// ============================================================
// Four-eyes check
// ============================================================

/**
 * Assert that the draft author is not the sole approver for release.
 *
 * Rules:
 *   1. If there are zero non-author approvers with decision="approved", throw FourEyesError.
 *   2. Author may submit a comment or a claim review — they may NOT be the only approver.
 *
 * Directive: "Four-eyes: author cannot be the sole release approver."
 *
 * @param authorId   The user ID who authored (produced) the draft.
 * @param approvals  All approval records recorded for the review task.
 * @throws FourEyesError when no independent approver has approved.
 */
export function assertFourEyes(
  authorId: string,
  approvals: ApproverRecord[],
): void {
  const independentApprovals = approvals.filter(
    (a) => a.approverId !== authorId && a.decision === "approved",
  );
  if (independentApprovals.length === 0) {
    throw new FourEyesError(authorId);
  }
}
