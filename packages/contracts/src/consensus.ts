/**
 * Consensus review contracts — Phase E (Unit 2: multi-party consensus review).
 *
 * Zod schemas for the multi-party consensus review:
 *   - ConsensusConfigSchema     — N named approvers, threshold (min approvals),
 *                                 deadline (ISO-8601 UTC).
 *   - ConsensusDecisionEventSchema — an append-only decision event (approver id,
 *                                    decision, timestamp).
 *   - ConsensusStateSchema       — the current consensus state (pending,
 *                                    approved, rejected, expired) derived from
 *                                    the decision events, the threshold, and
 *                                    the deadline.
 *
 * Directive Phase E:
 *   "Multi-party consensus review: N named approvers, threshold, no
 *    self-approval, decision event append-only. ... Deadline."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

// ============================================================
// Primitives
// ============================================================

const UuidString      = z.string().uuid();
const IsoUtc          = z.string().datetime();

// ============================================================
// Consensus decision (per approver)
// ============================================================

export const ConsensusDecisionSchema = z.enum(["approved", "rejected"]);
export type ConsensusDecision = z.infer<typeof ConsensusDecisionSchema>;

// ============================================================
// Consensus config
// ============================================================

/**
 * The consensus review configuration.
 *
 * - `approvers`: the N named approvers (user UUIDs) who may submit a decision.
 *   The author is excluded from this set (no self-approval).
 * - `threshold`: the minimum number of "approved" decisions required to
 *   reach consensus (approve). Must be > 0 and <= approvers.length.
 * - `authorId`: the author of the draft. The author cannot submit an approval
 *   (no self-approval). The author may be a non-approver or may submit a
 *   comment, but not an approval.
 *
 * Directive: "N named approvers, threshold, no self-approval."
 */
export const ConsensusConfigSchema = z.object({
  /** The author of the draft — cannot be an approver (no self-approval). */
  authorId:    UuidString,
  /** The named approvers (N >= 1). Must not include the author. */
  approvers:   z.array(UuidString).min(1),
  /** Minimum approvals required. Must be > 0 and <= approvers.length. */
  threshold:   z.number().int().positive(),
  /** The tenant id (server-derived; never client-supplied as authority). */
  tenantId:    UuidString,
  /**
   * Deadline for consensus decisions (ISO-8601 UTC). Decisions recorded
   * after this deadline are expired. The deadline is enforced by
   * checkConsensusDeadline in the domain layer.
   *
   * Directive Phase E: "Deadline."
   */
  deadline:    IsoUtc,
}).refine(
  (cfg) => cfg.threshold <= cfg.approvers.length,
  { message: "threshold must not exceed the number of approvers" },
).refine(
  (cfg) => !cfg.approvers.includes(cfg.authorId),
  { message: "author must not be an approver (no self-approval)" },
);
export type ConsensusConfig = z.infer<typeof ConsensusConfigSchema>;

// ============================================================
// Consensus decision event (append-only)
// ============================================================

/**
 * A single consensus decision event.
 *
 * Append-only: the DB trigger (migration 014) rejects UPDATE and DELETE.
 * Each event records an approver's decision at a point in time.
 *
 * Directive: "Decision event append-only."
 */
export const ConsensusDecisionEventSchema = z.object({
  /** The approver who submitted this decision. */
  approverId:  UuidString,
  /** The decision: "approved" or "rejected". */
  decision:    ConsensusDecisionSchema,
  /** ISO-8601 UTC timestamp of the decision. */
  decidedAt:   IsoUtc,
  /** The tenant id. */
  tenantId:    UuidString,
});
export type ConsensusDecisionEvent = z.infer<typeof ConsensusDecisionEventSchema>;

// ============================================================
// Consensus state
// ============================================================

export const ConsensusStateValueSchema = z.enum([
  "pending",    // not enough approvals yet, no rejections, not expired
  "approved",   // threshold met (>= threshold approvals, no rejections, not expired)
  "rejected",   // a rejection was recorded (immediate rejection)
  "expired",    // deadline passed before threshold was met (no rejection, not approved)
]);
export type ConsensusStateValue = z.infer<typeof ConsensusStateValueSchema>;

/**
 * The derived consensus state from the decision events, the config, and the
 * deadline.
 *
 * - "rejected" when any decision event is "rejected".
 * - "approved" when the number of "approved" events >= threshold and the
 *   deadline has not passed.
 * - "expired" when the deadline has passed and the threshold was not met
 *   (and no rejection was recorded).
 * - "pending" otherwise (not enough approvals, deadline not passed).
 */
export const ConsensusStateSchema = z.object({
  state:           ConsensusStateValueSchema,
  /** Number of approval events so far. */
  approvalCount:   z.number().int().min(0),
  /** Number of rejection events so far. */
  rejectionCount:  z.number().int().min(0),
  /** The threshold from the config. */
  threshold:       z.number().int().positive(),
  /** True when the state is "approved". */
  approved:        z.boolean(),
});
export type ConsensusState = z.infer<typeof ConsensusStateSchema>;
