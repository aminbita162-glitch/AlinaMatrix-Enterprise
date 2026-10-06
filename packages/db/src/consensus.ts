/**
 * DB layer for consensus decision events — Phase E (Unit 2: consensus review).
 *
 * Table: consensus_decision_events (append-only — INSERT only).
 *
 * Immutability:
 *   - consensus_decision_events is INSERT-only. Triggers reject UPDATE and
 *     DELETE; GRANT excludes UPDATE and DELETE.
 *   - The consensus state is derived by the domain layer (evaluateConsensus)
 *     from the events + the config; the DB does not recompute it.
 *
 * Directive Phase E:
 *   "Multi-party consensus review: N named approvers, threshold, no
 *    self-approval, decision event append-only."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { v4 as uuidv4 } from "uuid";
import type { DbClient } from "./client.js";

// ============================================================
// Row types
// ============================================================

export interface ConsensusDecisionEventRow {
  id:              string;
  tenant_id:       string;
  review_task_id:  string;
  approver_id:     string;
  decision:        string;
  decided_at:      Date;
  created_at:      Date;
}

// ============================================================
// consensus_decision_events — append-only (INSERT only)
// ============================================================

export interface InsertConsensusDecisionEventParams {
  tenantId:       string;
  reviewTaskId:   string;
  approverId:     string;
  decision:        string;
  decidedAt:      Date;
}

export async function insertConsensusDecisionEvent(
  client: DbClient,
  params: InsertConsensusDecisionEventParams,
): Promise<ConsensusDecisionEventRow> {
  const id = uuidv4();
  const res = await client.query<ConsensusDecisionEventRow>(
    `INSERT INTO consensus_decision_events
       (id, tenant_id, review_task_id, approver_id, decision, decided_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      id,
      params.tenantId,
      params.reviewTaskId,
      params.approverId,
      params.decision,
      params.decidedAt,
    ],
  );
  return res.rows[0]!;
}

export async function listConsensusDecisionEventsByTask(
  client: DbClient,
  reviewTaskId: string,
): Promise<ConsensusDecisionEventRow[]> {
  const res = await client.query<ConsensusDecisionEventRow>(
    `SELECT * FROM consensus_decision_events WHERE review_task_id = $1 ORDER BY decided_at ASC`,
    [reviewTaskId],
  );
  return res.rows;
}

export async function countConsensusApprovals(
  client: DbClient,
  reviewTaskId: string,
): Promise<number> {
  const res = await client.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM consensus_decision_events
     WHERE review_task_id = $1 AND decision = 'approved'`,
    [reviewTaskId],
  );
  return parseInt(res.rows[0]?.count ?? "0", 10);
}

export async function countConsensusRejections(
  client: DbClient,
  reviewTaskId: string,
): Promise<number> {
  const res = await client.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM consensus_decision_events
     WHERE review_task_id = $1 AND decision = 'rejected'`,
    [reviewTaskId],
  );
  return parseInt(res.rows[0]?.count ?? "0", 10);
}
