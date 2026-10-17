/**
 * Unit tests for packages/domain/src/consensus.ts — multi-party consensus
 * review (Phase E Unit 2).
 *
 * Covers:
 *   - buildConsensusConfig: validates N approvers, threshold, no self-approval.
 *   - assertNoSelfApproval: throws SelfApprovalError when the author approves.
 *   - assertApproverAuthorized: throws UnknownApproverError for unknown approvers.
 *   - recordConsensusDecision: appends a decision event (append-only).
 *   - evaluateConsensus: threshold not met → pending; threshold met → approved;
 *     any rejection → rejected.
 *   - assertConsensusApproved: throws ConsensusNotApprovedError when threshold
 *     not met (threshold-not-met rejection).
 *
 * Directive Phase E:
 *   "Multi-party consensus review: N named approvers, threshold, no
 *    self-approval, decision event append-only. ... Tests for unknown key
 *    dropped, threshold not met, and self-approval rejected."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import {
  buildConsensusConfig,
  assertNoSelfApproval,
  assertApproverAuthorized,
  recordConsensusDecision,
  checkConsensusDeadline,
  assertConsensusWithinDeadline,
  evaluateConsensus,
  assertConsensusApproved,
  SelfApprovalError,
  UnknownApproverError,
  ConsensusNotApprovedError,
  ConsensusRejectedError,
  ConsensusExpiredError,
  ConsensusInputError,
} from "./consensus.js";
import type {
  ConsensusConfig,
  ConsensusDecisionEvent,
} from "@alinamatrix/contracts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT   = "aaaaaaaa-0000-4000-a000-000000000001";
const AUTHOR   = "bbbbbbbb-0000-4000-b000-000000000002";
const APPROVER1 = "cccccccc-0000-4000-c000-000000000003";
const APPROVER2 = "dddddddd-0000-4000-d000-000000000004";
const APPROVER3 = "eeeeeeee-0000-4000-e000-000000000005";
const DEADLINE  = "2026-12-31T23:59:59.999Z";
const NOW_BEFORE = "2026-10-06T12:00:00.000Z";
const NOW_AFTER  = "2027-01-01T00:00:00.000Z";

function makeConfig(overrides: Partial<ConsensusConfig> = {}): ConsensusConfig {
  return {
    authorId:  AUTHOR,
    approvers:  [APPROVER1, APPROVER2, APPROVER3],
    threshold:  2,
    tenantId:   TENANT,
    deadline:   "2026-12-31T23:59:59.999Z",
    ...overrides,
  };
}

function makeEvent(overrides: Partial<ConsensusDecisionEvent> = {}): ConsensusDecisionEvent {
  return {
    approverId:  APPROVER1,
    decision:    "approved",
    decidedAt:   "2026-10-06T12:00:00.000Z",
    tenantId:    TENANT,
    ...overrides,
  };
}

// ===========================================================================
// buildConsensusConfig
// ===========================================================================

describe("buildConsensusConfig", () => {
  it("assembles a valid consensus config", () => {
    const cfg = buildConsensusConfig({
      authorId:  AUTHOR,
      approvers:  [APPROVER1, APPROVER2, APPROVER3],
      threshold:  2,
      tenantId:   TENANT,
      deadline:   DEADLINE,
    });
    expect(cfg.authorId).toBe(AUTHOR);
    expect(cfg.approvers).toEqual([APPROVER1, APPROVER2, APPROVER3]);
    expect(cfg.threshold).toBe(2);
    expect(cfg.tenantId).toBe(TENANT);
  });

  it("rejects empty approvers", () => {
    expect(() =>
      buildConsensusConfig({
        authorId:  AUTHOR,
        approvers:  [],
        threshold:  1,
        tenantId:   TENANT,
        deadline:   DEADLINE,
      }),
    ).toThrow(ConsensusInputError);
  });

  it("rejects threshold <= 0", () => {
    expect(() =>
      buildConsensusConfig({
        authorId:  AUTHOR,
        approvers:  [APPROVER1],
        threshold:  0,
        tenantId:   TENANT,
        deadline:   DEADLINE,
      }),
    ).toThrow(ConsensusInputError);
  });

  it("rejects threshold > approvers.length", () => {
    expect(() =>
      buildConsensusConfig({
        authorId:  AUTHOR,
        approvers:  [APPROVER1, APPROVER2],
        threshold:  3,
        tenantId:   TENANT,
        deadline:   DEADLINE,
      }),
    ).toThrow(ConsensusInputError);
  });

  it("rejects empty tenantId", () => {
    expect(() =>
      buildConsensusConfig({
        authorId:  AUTHOR,
        approvers:  [APPROVER1],
        threshold:  1,
        tenantId:   "",
        deadline:   DEADLINE,
      }),
    ).toThrow(ConsensusInputError);
  });

  it("rejects self-approval (author in the approvers set)", () => {
    expect(() =>
      buildConsensusConfig({
        authorId:  AUTHOR,
        approvers:  [AUTHOR, APPROVER1],
        threshold:  1,
        tenantId:   TENANT,
        deadline:   DEADLINE,
      }),
    ).toThrow(SelfApprovalError);
  });
});

// ===========================================================================
// assertNoSelfApproval — self-approval rejected
// ===========================================================================

describe("assertNoSelfApproval (self-approval rejected)", () => {
  it("does not throw when a non-author approver approves", () => {
    expect(() =>
      assertNoSelfApproval(AUTHOR, APPROVER1, "approved"),
    ).not.toThrow();
  });

  it("throws SelfApprovalError when the author approves", () => {
    expect(() =>
      assertNoSelfApproval(AUTHOR, AUTHOR, "approved"),
    ).toThrow(SelfApprovalError);
  });

  it("does not throw when the author rejects (reject is not an approval)", () => {
    expect(() =>
      assertNoSelfApproval(AUTHOR, AUTHOR, "rejected"),
    ).not.toThrow();
  });

  it("the error message names the author", () => {
    try {
      assertNoSelfApproval(AUTHOR, AUTHOR, "approved");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SelfApprovalError);
      expect((e as SelfApprovalError).message).toContain(AUTHOR);
    }
  });
});

// ===========================================================================
// assertApproverAuthorized
// ===========================================================================

describe("assertApproverAuthorized", () => {
  it("does not throw for a known approver", () => {
    expect(() =>
      assertApproverAuthorized([APPROVER1, APPROVER2], APPROVER1),
    ).not.toThrow();
  });

  it("throws UnknownApproverError for an unknown approver", () => {
    expect(() =>
      assertApproverAuthorized([APPROVER1], APPROVER2),
    ).toThrow(UnknownApproverError);
  });
});

// ===========================================================================
// recordConsensusDecision — append a decision event
// ===========================================================================

describe("recordConsensusDecision", () => {
  it("appends a decision event for an authorized approver", () => {
    const cfg = makeConfig();
    const event = recordConsensusDecision(cfg, {
      approverId:  APPROVER1,
      decision:    "approved",
      decidedAt:   "2026-10-06T12:00:00.000Z",
      tenantId:    TENANT,
    });
    expect(event.approverId).toBe(APPROVER1);
    expect(event.decision).toBe("approved");
    expect(event.decidedAt).toBe("2026-10-06T12:00:00.000Z");
    expect(event.tenantId).toBe(TENANT);
  });

  it("rejects an unknown approver", () => {
    const cfg = makeConfig();
    expect(() =>
      recordConsensusDecision(cfg, {
        approverId:  "ffffffff-0000-4000-f000-000000000099",
        decision:    "approved",
        decidedAt:   "2026-10-06T12:00:00.000Z",
        tenantId:    TENANT,
      }),
    ).toThrow(UnknownApproverError);
  });

  it("rejects self-approval (author submitting an approval)", () => {
    const cfg = makeConfig({ approvers: [APPROVER1, APPROVER2], threshold: 1 });
    expect(() =>
      recordConsensusDecision(cfg, {
        approverId:  AUTHOR,
        decision:    "approved",
        decidedAt:   "2026-10-06T12:00:00.000Z",
        tenantId:    TENANT,
      }),
    ).toThrow(SelfApprovalError);
  });

  it("allows the author to reject (reject is not an approval)", () => {
    // The author is not in the approver set, so this would fail the
    // approver-authorization check. But if the author WERE an approver,
    // a reject would pass the self-approval check. Test the pure function:
    assertNoSelfApproval(AUTHOR, AUTHOR, "rejected"); // does not throw
  });
});

// ===========================================================================
// evaluateConsensus — threshold logic
// ===========================================================================

describe("evaluateConsensus", () => {
  it("returns pending when no events", () => {
    const cfg = makeConfig({ threshold: 2 });
    const result = evaluateConsensus([], cfg, NOW_BEFORE);
    expect(result.state).toBe("pending");
    expect(result.approved).toBe(false);
    expect(result.approvalCount).toBe(0);
    expect(result.rejectionCount).toBe(0);
  });

  it("returns pending when approvals below threshold", () => {
    const cfg = makeConfig({ threshold: 2 });
    const events = [makeEvent({ approverId: APPROVER1 })];
    const result = evaluateConsensus(events, cfg, NOW_BEFORE);
    expect(result.state).toBe("pending");
    expect(result.approved).toBe(false);
    expect(result.approvalCount).toBe(1);
  });

  it("returns approved when approvals meet threshold", () => {
    const cfg = makeConfig({ threshold: 2 });
    const events = [
      makeEvent({ approverId: APPROVER1, decidedAt: "2026-10-06T12:00:00.000Z" }),
      makeEvent({ approverId: APPROVER2, decidedAt: "2026-10-06T12:01:00.000Z" }),
    ];
    const result = evaluateConsensus(events, cfg, NOW_BEFORE);
    expect(result.state).toBe("approved");
    expect(result.approved).toBe(true);
    expect(result.approvalCount).toBe(2);
  });

  it("returns approved when approvals exceed threshold", () => {
    const cfg = makeConfig({ threshold: 2 });
    const events = [
      makeEvent({ approverId: APPROVER1 }),
      makeEvent({ approverId: APPROVER2 }),
      makeEvent({ approverId: APPROVER3 }),
    ];
    const result = evaluateConsensus(events, cfg, NOW_BEFORE);
    expect(result.state).toBe("approved");
    expect(result.approvalCount).toBe(3);
  });

  it("returns rejected when any rejection is present (even with enough approvals)", () => {
    const cfg = makeConfig({ threshold: 2 });
    const events = [
      makeEvent({ approverId: APPROVER1 }),
      makeEvent({ approverId: APPROVER2 }),
      makeEvent({ approverId: APPROVER3, decision: "rejected" }),
    ];
    const result = evaluateConsensus(events, cfg, NOW_BEFORE);
    expect(result.state).toBe("rejected");
    expect(result.approved).toBe(false);
    expect(result.rejectionCount).toBe(1);
  });

  it("returns rejected when only rejections", () => {
    const cfg = makeConfig({ threshold: 1 });
    const events = [
      makeEvent({ approverId: APPROVER1, decision: "rejected" }),
    ];
    const result = evaluateConsensus(events, cfg, NOW_BEFORE);
    expect(result.state).toBe("rejected");
  });

  it("is deterministic: same events + same config produce the same state", () => {
    const cfg = makeConfig({ threshold: 2 });
    const events = [
      makeEvent({ approverId: APPROVER1 }),
      makeEvent({ approverId: APPROVER2 }),
    ];
    const a = evaluateConsensus(events, cfg, NOW_BEFORE);
    const b = evaluateConsensus(events, cfg, NOW_BEFORE);
    expect(a).toEqual(b);
  });
});

// ===========================================================================
// assertConsensusApproved — threshold-not-met rejection
// ===========================================================================

describe("assertConsensusApproved (threshold-not-met rejection)", () => {
  it("returns the approved state when threshold is met", () => {
    const cfg = makeConfig({ threshold: 2 });
    const events = [
      makeEvent({ approverId: APPROVER1 }),
      makeEvent({ approverId: APPROVER2 }),
    ];
    const result = assertConsensusApproved(events, cfg, NOW_BEFORE);
    expect(result.state).toBe("approved");
    expect(result.approved).toBe(true);
  });

  it("throws ConsensusNotApprovedError when threshold not met", () => {
    const cfg = makeConfig({ threshold: 2 });
    const events = [makeEvent({ approverId: APPROVER1 })];
    expect(() => assertConsensusApproved(events, cfg, NOW_BEFORE)).toThrow(
      ConsensusNotApprovedError,
    );
  });

  it("the ConsensusNotApprovedError message names the counts", () => {
    const cfg = makeConfig({ threshold: 3 });
    const events = [makeEvent({ approverId: APPROVER1 })];
    try {
      assertConsensusApproved(events, cfg, NOW_BEFORE);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ConsensusNotApprovedError);
      const msg = (e as ConsensusNotApprovedError).message;
      expect(msg).toContain("1");
      expect(msg).toContain("3");
    }
  });

  it("throws ConsensusRejectedError when a rejection is present", () => {
    const cfg = makeConfig({ threshold: 1 });
    const events = [
      makeEvent({ approverId: APPROVER1, decision: "rejected" }),
    ];
    expect(() => assertConsensusApproved(events, cfg, NOW_BEFORE)).toThrow(
      ConsensusRejectedError,
    );
  });

  it("throws ConsensusNotApprovedError when no events", () => {
    const cfg = makeConfig({ threshold: 1 });
    expect(() => assertConsensusApproved([], cfg, NOW_BEFORE)).toThrow(
      ConsensusNotApprovedError,
    );
  });
});

// ===========================================================================
// checkConsensusDeadline — deadline enforcement
// ===========================================================================

describe("checkConsensusDeadline", () => {
  it("returns expired=false when now is before the deadline", () => {
    const cfg = makeConfig();
    const result = checkConsensusDeadline(cfg, NOW_BEFORE);
    expect(result.expired).toBe(false);
    expect(result.deadline).toBe(cfg.deadline);
    expect(result.now).toBe(NOW_BEFORE);
  });

  it("returns expired=false when now equals the deadline (inclusive)", () => {
    const cfg = makeConfig();
    const result = checkConsensusDeadline(cfg, cfg.deadline);
    expect(result.expired).toBe(false);
  });

  it("returns expired=true when now is after the deadline", () => {
    const cfg = makeConfig();
    const result = checkConsensusDeadline(cfg, NOW_AFTER);
    expect(result.expired).toBe(true);
  });
});

// ===========================================================================
// assertConsensusWithinDeadline — deadline-passed rejection
// ===========================================================================

describe("assertConsensusWithinDeadline", () => {
  it("does not throw when now is before the deadline", () => {
    const cfg = makeConfig();
    expect(() => assertConsensusWithinDeadline(cfg, NOW_BEFORE)).not.toThrow();
  });

  it("does not throw when now equals the deadline (inclusive)", () => {
    const cfg = makeConfig();
    expect(() => assertConsensusWithinDeadline(cfg, cfg.deadline)).not.toThrow();
  });

  it("throws ConsensusExpiredError when now is after the deadline", () => {
    const cfg = makeConfig();
    expect(() => assertConsensusWithinDeadline(cfg, NOW_AFTER)).toThrow(
      ConsensusExpiredError,
    );
  });

  it("the ConsensusExpiredError message names the deadline and now", () => {
    const cfg = makeConfig();
    try {
      assertConsensusWithinDeadline(cfg, NOW_AFTER);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ConsensusExpiredError);
      const msg = (e as ConsensusExpiredError).message;
      expect(msg).toContain(cfg.deadline);
      expect(msg).toContain(NOW_AFTER);
    }
  });
});

// ===========================================================================
// evaluateConsensus — expired state
// ===========================================================================

describe("evaluateConsensus — expired state", () => {
  it("returns expired when deadline passed and threshold not met", () => {
    const cfg = makeConfig({ threshold: 2 });
    const events = [makeEvent({ approverId: APPROVER1 })];
    const result = evaluateConsensus(events, cfg, NOW_AFTER);
    expect(result.state).toBe("expired");
    expect(result.approved).toBe(false);
  });

  it("returns approved (not expired) when threshold met before deadline", () => {
    const cfg = makeConfig({ threshold: 2 });
    const events = [
      makeEvent({ approverId: APPROVER1 }),
      makeEvent({ approverId: APPROVER2 }),
    ];
    const result = evaluateConsensus(events, cfg, NOW_BEFORE);
    expect(result.state).toBe("approved");
  });

  it("returns approved even when deadline passed if threshold was met", () => {
    const cfg = makeConfig({ threshold: 2 });
    const events = [
      makeEvent({ approverId: APPROVER1 }),
      makeEvent({ approverId: APPROVER2 }),
    ];
    const result = evaluateConsensus(events, cfg, NOW_AFTER);
    expect(result.state).toBe("approved");
  });

  it("returns rejected (not expired) when a rejection is present even after deadline", () => {
    const cfg = makeConfig({ threshold: 1 });
    const events = [
      makeEvent({ approverId: APPROVER1, decision: "rejected" }),
    ];
    const result = evaluateConsensus(events, cfg, NOW_AFTER);
    expect(result.state).toBe("rejected");
  });

  it("returns pending when deadline not passed and threshold not met", () => {
    const cfg = makeConfig({ threshold: 2 });
    const events = [makeEvent({ approverId: APPROVER1 })];
    const result = evaluateConsensus(events, cfg, NOW_BEFORE);
    expect(result.state).toBe("pending");
  });
});

// ===========================================================================
// assertConsensusApproved — expired rejection
// ===========================================================================

describe("assertConsensusApproved — expired rejection", () => {
  it("throws ConsensusExpiredError when deadline passed and threshold not met", () => {
    const cfg = makeConfig({ threshold: 2 });
    const events = [makeEvent({ approverId: APPROVER1 })];
    expect(() => assertConsensusApproved(events, cfg, NOW_AFTER)).toThrow(
      ConsensusExpiredError,
    );
  });

  it("does not throw when threshold met before deadline", () => {
    const cfg = makeConfig({ threshold: 2 });
    const events = [
      makeEvent({ approverId: APPROVER1 }),
      makeEvent({ approverId: APPROVER2 }),
    ];
    expect(() => assertConsensusApproved(events, cfg, NOW_BEFORE)).not.toThrow();
  });
});
