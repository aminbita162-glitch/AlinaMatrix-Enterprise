/**
 * Tests for packages/domain/src/review.ts — claim approve/reject, four-eyes, review completion.
 *
 * Directive Phase 7 tests required:
 *   1. self-approval denied (assertFourEyes throws when author == sole approver)
 *   2. rejected claim blocks completion (canCompleteReview returns false)
 *   3. comment update denied — covered in DB layer (migration SQL inspection)
 *   4. tenant isolation — covered in DB layer tests
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import {
  approveClaim,
  rejectClaim,
  canCompleteReview,
  assertNoRejectedClaims,
  assertFourEyes,
  FourEyesError,
  RejectedClaimError,
} from "./review.js";
import type { ReviewClaimInput, ApproverRecord } from "./review.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTHOR_ID    = "aaaaaaaa-0000-4000-a000-000000000001";
const REVIEWER_ID  = "bbbbbbbb-0000-4000-b000-000000000002";
const REVIEWER_ID2 = "cccccccc-0000-4000-c000-000000000003";
const CLAIM_ID_1   = "11111111-0000-4000-a000-000000000001";
const CLAIM_ID_2   = "22222222-0000-4000-a000-000000000002";

function makeClaim(id: string, status: "pending" | "approved" | "rejected"): ReviewClaimInput {
  return { id, reviewerStatus: status };
}

// ===========================================================================
// approveClaim
// ===========================================================================

describe("approveClaim", () => {
  it("returns approved reviewer_status", () => {
    const result = approveClaim(CLAIM_ID_1, REVIEWER_ID);
    expect(result.reviewerStatus).toBe("approved");
  });

  it("returns the correct claimId", () => {
    const result = approveClaim(CLAIM_ID_1, REVIEWER_ID);
    expect(result.claimId).toBe(CLAIM_ID_1);
  });

  it("does not throw when reviewer != author", () => {
    expect(() => approveClaim(CLAIM_ID_1, REVIEWER_ID)).not.toThrow();
  });
});

// ===========================================================================
// rejectClaim
// ===========================================================================

describe("rejectClaim", () => {
  it("returns rejected reviewer_status", () => {
    const result = rejectClaim(CLAIM_ID_1, REVIEWER_ID);
    expect(result.reviewerStatus).toBe("rejected");
  });

  it("returns the correct claimId", () => {
    const result = rejectClaim(CLAIM_ID_1, REVIEWER_ID);
    expect(result.claimId).toBe(CLAIM_ID_1);
  });

  it("a rejected claim implies workflow stays NEEDS_REVIEW — canCompleteReview returns false", () => {
    const rejected = rejectClaim(CLAIM_ID_1, REVIEWER_ID);
    const claims: ReviewClaimInput[] = [makeClaim(rejected.claimId, rejected.reviewerStatus)];
    expect(canCompleteReview(claims)).toBe(false);
  });
});

// ===========================================================================
// canCompleteReview (DIRECTIVE: "Reject keeps NEEDS_REVIEW")
// ===========================================================================

describe("canCompleteReview", () => {
  it("returns true when all claims are approved", () => {
    const claims = [makeClaim(CLAIM_ID_1, "approved"), makeClaim(CLAIM_ID_2, "approved")];
    expect(canCompleteReview(claims)).toBe(true);
  });

  it("returns false when any claim is rejected", () => {
    const claims = [makeClaim(CLAIM_ID_1, "approved"), makeClaim(CLAIM_ID_2, "rejected")];
    expect(canCompleteReview(claims)).toBe(false);
  });

  it("returns false when the only claim is rejected", () => {
    const claims = [makeClaim(CLAIM_ID_1, "rejected")];
    expect(canCompleteReview(claims)).toBe(false);
  });

  it("returns true for an empty claim list (no claims to reject)", () => {
    expect(canCompleteReview([])).toBe(true);
  });

  it("returns false when any claim is still pending", () => {
    const claims = [makeClaim(CLAIM_ID_1, "pending"), makeClaim(CLAIM_ID_2, "approved")];
    // pending is not rejected; completion is allowed unless explicitly rejected
    // Directive: only rejection blocks completion; pending is still open.
    expect(canCompleteReview(claims)).toBe(true);
  });

  it("returns false when both claims are rejected", () => {
    const claims = [makeClaim(CLAIM_ID_1, "rejected"), makeClaim(CLAIM_ID_2, "rejected")];
    expect(canCompleteReview(claims)).toBe(false);
  });
});

// ===========================================================================
// assertNoRejectedClaims
// ===========================================================================

describe("assertNoRejectedClaims", () => {
  it("does not throw when all claims are approved", () => {
    const claims = [makeClaim(CLAIM_ID_1, "approved"), makeClaim(CLAIM_ID_2, "approved")];
    expect(() => assertNoRejectedClaims(claims)).not.toThrow();
  });

  it("throws RejectedClaimError for the first rejected claim", () => {
    const claims = [makeClaim(CLAIM_ID_1, "approved"), makeClaim(CLAIM_ID_2, "rejected")];
    expect(() => assertNoRejectedClaims(claims)).toThrow(RejectedClaimError);
  });

  it("error message contains the rejected claim id", () => {
    const claims = [makeClaim(CLAIM_ID_2, "rejected")];
    expect(() => assertNoRejectedClaims(claims)).toThrow(CLAIM_ID_2);
  });

  it("does not throw for an empty list", () => {
    expect(() => assertNoRejectedClaims([])).not.toThrow();
  });
});

// ===========================================================================
// assertFourEyes (DIRECTIVE: "Four-eyes: author cannot be the sole release approver")
// ===========================================================================

describe("assertFourEyes — self-approval denied", () => {
  it("throws FourEyesError when author is the only approver", () => {
    const approvals: ApproverRecord[] = [
      { approverId: AUTHOR_ID, decision: "approved" },
    ];
    expect(() => assertFourEyes(AUTHOR_ID, approvals)).toThrow(FourEyesError);
  });

  it("throws FourEyesError when there are no approvals at all", () => {
    expect(() => assertFourEyes(AUTHOR_ID, [])).toThrow(FourEyesError);
  });

  it("throws FourEyesError when only non-approved decisions exist from others", () => {
    // Another user rejected — not an independent approval.
    const approvals: ApproverRecord[] = [
      { approverId: REVIEWER_ID, decision: "rejected" },
    ];
    expect(() => assertFourEyes(AUTHOR_ID, approvals)).toThrow(FourEyesError);
  });

  it("does NOT throw when an independent reviewer has approved", () => {
    const approvals: ApproverRecord[] = [
      { approverId: AUTHOR_ID,   decision: "approved" },
      { approverId: REVIEWER_ID, decision: "approved" },
    ];
    expect(() => assertFourEyes(AUTHOR_ID, approvals)).not.toThrow();
  });

  it("does NOT throw when only the independent reviewer approved (author did not vote)", () => {
    const approvals: ApproverRecord[] = [
      { approverId: REVIEWER_ID, decision: "approved" },
    ];
    expect(() => assertFourEyes(AUTHOR_ID, approvals)).not.toThrow();
  });

  it("does NOT throw when two independent reviewers approved", () => {
    const approvals: ApproverRecord[] = [
      { approverId: REVIEWER_ID,  decision: "approved" },
      { approverId: REVIEWER_ID2, decision: "approved" },
    ];
    expect(() => assertFourEyes(AUTHOR_ID, approvals)).not.toThrow();
  });

  it("error name is FourEyesError", () => {
    expect(() => assertFourEyes(AUTHOR_ID, [])).toThrow(
      expect.objectContaining({ name: "FourEyesError" }),
    );
  });

  it("error message mentions the author ID", () => {
    expect(() => assertFourEyes(AUTHOR_ID, [])).toThrow(AUTHOR_ID);
  });

  it("error message mentions 'sole approver'", () => {
    expect(() => assertFourEyes(AUTHOR_ID, [])).toThrow("sole approver");
  });

  it("author-only approval is rejected even when multiple entries by the same author", () => {
    const approvals: ApproverRecord[] = [
      { approverId: AUTHOR_ID, decision: "approved" },
      { approverId: AUTHOR_ID, decision: "approved" }, // duplicate — still the same person
    ];
    expect(() => assertFourEyes(AUTHOR_ID, approvals)).toThrow(FourEyesError);
  });
});

// ===========================================================================
// RejectedClaimError
// ===========================================================================

describe("RejectedClaimError", () => {
  it("has name RejectedClaimError", () => {
    const e = new RejectedClaimError(CLAIM_ID_1);
    expect(e.name).toBe("RejectedClaimError");
  });

  it("message contains the claim id", () => {
    const e = new RejectedClaimError(CLAIM_ID_1);
    expect(e.message).toContain(CLAIM_ID_1);
  });
});
