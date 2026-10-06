/**
 * Multi-party consensus review — Phase E (Unit 2: consensus review).
 *
 * Covers:
 *   - buildConsensusConfig — validate and assemble a consensus config (N
 *     approvers, threshold, no self-approval).
 *   - assertNoSelfApproval — throw SelfApprovalError when the author submits
 *     an approval (no self-approval).
 *   - assertApproverAuthorized — throw UnknownApproverError when an approver
 *     is not in the named approver set.
 *   - recordConsensusDecision — append a decision event (append-only).
 *   - evaluateConsensus — derive the consensus state from the decision events
 *     and the threshold (threshold not met → pending; threshold met → approved;
 *     any rejection → rejected).
 *   - assertConsensusApproved — throw ConsensusNotApprovedError when the
 *     threshold is not met (threshold-not-met rejection).
 *
 * Directive Phase E:
 *   "Multi-party consensus review: N named approvers, threshold, no
 *    self-approval, decision event append-only. Published bytes do not
 *    change."
 *
 * Determinism:
 *   - evaluateConsensus is a pure function of (events, config).
 *   - No Date.now() or Math.random() is used. The caller supplies timestamps.
 *
 * Status: Enterprise Candidate — Active Development
 */
import type {
  ConsensusConfig,
  ConsensusDecision,
  ConsensusDecisionEvent,
  ConsensusState,
  ConsensusStateValue,
} from "@alinamatrix/contracts";

// ============================================================
// Errors
// ============================================================

export class SelfApprovalError extends Error {
  constructor(authorId: string) {
    super(
      `Self-approval rejected: user "${authorId}" is the author and cannot ` +
      "submit an approval. The author is excluded from the approver set.",
    );
    this.name = "SelfApprovalError";
  }
}

export class UnknownApproverError extends Error {
  constructor(approverId: string) {
    super(
      `Unknown approver: user "${approverId}" is not in the named approver set.`,
    );
    this.name = "UnknownApproverError";
  }
}

export class ConsensusNotApprovedError extends Error {
  constructor(approvalCount: number, threshold: number) {
    super(
      `Consensus not approved: ${approvalCount} approval(s) recorded, ` +
      `threshold is ${threshold}. ${threshold - approvalCount} more ` +
      "approval(s) required.",
    );
    this.name = "ConsensusNotApprovedError";
  }
}

export class ConsensusRejectedError extends Error {
  constructor(rejectionCount: number) {
    super(
      `Consensus rejected: ${rejectionCount} rejection event(s) recorded. ` +
      "A rejection blocks consensus approval.",
    );
    this.name = "ConsensusRejectedError";
  }
}

export class ConsensusInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsensusInputError";
  }
}

// ============================================================
// buildConsensusConfig
// ============================================================

export interface BuildConsensusConfigInput {
  authorId:    string;
  approvers:   string[];
  threshold:   number;
  tenantId:    string;
}

/**
 * Validate and assemble a consensus config.
 *
 * Throws ConsensusInputError when:
 *   - approvers is empty.
 *   - threshold <= 0 or threshold > approvers.length.
 *   - author is in the approvers set (no self-approval).
 *   - tenantId is empty.
 *
 * The tenant id is server-derived (from the session membership) and is never
 * accepted from the client as the isolation authority (H03).
 */
export function buildConsensusConfig(input: BuildConsensusConfigInput): ConsensusConfig {
  if (input.approvers.length === 0) {
    throw new ConsensusInputError("approvers must not be empty");
  }
  if (input.threshold <= 0) {
    throw new ConsensusInputError("threshold must be > 0");
  }
  if (input.threshold > input.approvers.length) {
    throw new ConsensusInputError(
      "threshold must not exceed the number of approvers",
    );
  }
  if (input.tenantId.length === 0) {
    throw new ConsensusInputError("tenantId must not be empty");
  }
  if (input.approvers.includes(input.authorId)) {
    throw new SelfApprovalError(input.authorId);
  }
  return {
    authorId:    input.authorId,
    approvers:   [...input.approvers],
    threshold:   input.threshold,
    tenantId:    input.tenantId,
  };
}

// ============================================================
// assertNoSelfApproval
// ============================================================

/**
 * Assert that the author is not submitting an approval.
 *
 * Throws SelfApprovalError when the submitter is the author. The author may
 * submit a comment but not an approval.
 *
 * Directive: "No self-approval."
 */
export function assertNoSelfApproval(
  authorId: string,
  submitterId: string,
  decision: ConsensusDecision,
): void {
  if (submitterId === authorId && decision === "approved") {
    throw new SelfApprovalError(authorId);
  }
}

// ============================================================
// assertApproverAuthorized
// ============================================================

/**
 * Assert that a submitter is in the named approver set.
 *
 * Throws UnknownApproverError when the submitter is not an approver.
 * The author is not an approver (excluded by config), so the author cannot
 * submit a decision — this is separate from the self-approval check.
 */
export function assertApproverAuthorized(
  approvers: string[],
  submitterId: string,
): void {
  if (!approvers.includes(submitterId)) {
    throw new UnknownApproverError(submitterId);
  }
}

// ============================================================
// recordConsensusDecision — append a decision event
// ============================================================

export interface RecordConsensusDecisionInput {
  approverId:  string;
  decision:    ConsensusDecision;
  decidedAt:   string;
  tenantId:    string;
}

/**
 * Append a consensus decision event.
 *
 * The decision event is append-only: the DB trigger (migration 014) rejects
 * UPDATE and DELETE. This function validates that the submitter is an
 * authorized approver and that the author is not self-approving, then returns
 * a new event record.
 *
 * Directive: "Decision event append-only."
 */
export function recordConsensusDecision(
  config: ConsensusConfig,
  input: RecordConsensusDecisionInput,
): ConsensusDecisionEvent {
  // Self-approval check first: the author is deliberately excluded from the
  // approver set by buildConsensusConfig, so if we checked approver
  // authorization first the author would trip UnknownApproverError before
  // the more specific SelfApprovalError fires. Order the most specific
  // check first.
  assertNoSelfApproval(config.authorId, input.approverId, input.decision);
  assertApproverAuthorized(config.approvers, input.approverId);
  return {
    approverId:  input.approverId,
    decision:    input.decision,
    decidedAt:   input.decidedAt,
    tenantId:    input.tenantId,
  };
}

// ============================================================
// evaluateConsensus — derive state from events + threshold
// ============================================================

/**
 * Evaluate the consensus state from the decision events and the config.
 *
 * Rules:
 *   1. If any event is "rejected", the state is "rejected" (a rejection
 *      blocks approval immediately).
 *   2. If the number of "approved" events >= threshold, the state is "approved".
 *   3. Otherwise, the state is "pending".
 *
 * Published bytes do not change: the state is a pure function of the events
 * and the config. The same events + same config always produce the same state.
 *
 * Directive: "Threshold, ... Published bytes do not change."
 */
export function evaluateConsensus(
  events: ConsensusDecisionEvent[],
  config: ConsensusConfig,
): ConsensusState {
  const approvals = events.filter((e) => e.decision === "approved");
  const rejections = events.filter((e) => e.decision === "rejected");
  const approvalCount = approvals.length;
  const rejectionCount = rejections.length;

  let state: ConsensusStateValue;
  if (rejectionCount > 0) {
    state = "rejected";
  } else if (approvalCount >= config.threshold) {
    state = "approved";
  } else {
    state = "pending";
  }

  return {
    state,
    approvalCount,
    rejectionCount,
    threshold:    config.threshold,
    approved:     state === "approved",
  };
}

// ============================================================
// assertConsensusApproved — threshold-not-met rejection
// ============================================================

/**
 * Assert that the consensus is approved (threshold met, no rejections).
 *
 * Throws ConsensusNotApprovedError when the threshold is not met.
 * Throws ConsensusRejectedError when a rejection was recorded.
 *
 * Directive: "Tests for threshold not met."
 */
export function assertConsensusApproved(
  events: ConsensusDecisionEvent[],
  config: ConsensusConfig,
): ConsensusState {
  const result = evaluateConsensus(events, config);
  if (result.state === "rejected") {
    throw new ConsensusRejectedError(result.rejectionCount);
  }
  if (result.state !== "approved") {
    throw new ConsensusNotApprovedError(result.approvalCount, config.threshold);
  }
  return result;
}
