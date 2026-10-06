/**
 * Database access layer for Phase 7: human review.
 * Tables: review_tasks, approvals, comments.
 *
 * Comments are immutable — the DB trigger and GRANT both prevent UPDATE/DELETE.
 * All functions require tenant context to be set by the caller.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { v4 as uuidv4 } from "uuid";
import type { DbClient } from "./client.js";

// ============================================================
// Row types
// ============================================================

export type ReviewTaskState = "open" | "approved" | "rejected";
export type ApprovalDecision = "approved" | "rejected";

export interface ReviewTaskRow {
  id:              string;
  tenant_id:       string;
  project_id:      string;
  workflow_run_id: string;
  draft_id:        string | null;
  author_id:       string;
  state:           ReviewTaskState;
  created_at:      Date;
  updated_at:      Date;
}

export interface ApprovalRow {
  id:          string;
  tenant_id:   string;
  task_id:     string;
  approver_id: string;
  decision:    ApprovalDecision;
  note:        string | null;
  created_at:  Date;
}

export interface CommentRow {
  id:         string;
  tenant_id:  string;
  task_id:    string;
  author_id:  string;
  body:       string;
  created_at: Date;
}

// ============================================================
// review_tasks
// ============================================================

export interface InsertReviewTaskParams {
  tenantId:       string;
  projectId:      string;
  workflowRunId:  string;
  draftId?:       string | null;
  authorId:       string;
}

export async function insertReviewTask(
  client: DbClient,
  params: InsertReviewTaskParams,
): Promise<ReviewTaskRow> {
  const id = uuidv4();
  const res = await client.query<ReviewTaskRow>(
    `INSERT INTO review_tasks
       (id, tenant_id, project_id, workflow_run_id, draft_id, author_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (workflow_run_id) DO NOTHING
     RETURNING *`,
    [
      id,
      params.tenantId,
      params.projectId,
      params.workflowRunId,
      params.draftId ?? null,
      params.authorId,
    ],
  );
  if (res.rows.length === 0) {
    return getReviewTaskByRun(client, params.workflowRunId);
  }
  return res.rows[0]!;
}

export async function getReviewTask(
  client: DbClient,
  taskId: string,
): Promise<ReviewTaskRow | null> {
  const res = await client.query<ReviewTaskRow>(
    `SELECT * FROM review_tasks WHERE id = $1`,
    [taskId],
  );
  return res.rows[0] ?? null;
}

export async function getReviewTaskByRun(
  client: DbClient,
  workflowRunId: string,
): Promise<ReviewTaskRow> {
  const res = await client.query<ReviewTaskRow>(
    `SELECT * FROM review_tasks WHERE workflow_run_id = $1`,
    [workflowRunId],
  );
  if (res.rows.length === 0) {
    throw new Error(`Review task not found for workflow_run_id: ${workflowRunId}`);
  }
  return res.rows[0]!;
}

export async function listReviewTasksByProject(
  client: DbClient,
  projectId: string,
): Promise<ReviewTaskRow[]> {
  const res = await client.query<ReviewTaskRow>(
    `SELECT * FROM review_tasks WHERE project_id = $1 ORDER BY created_at DESC`,
    [projectId],
  );
  return res.rows;
}

export async function listOpenReviewTasks(
  client: DbClient,
  tenantId: string,
): Promise<ReviewTaskRow[]> {
  const res = await client.query<ReviewTaskRow>(
    `SELECT * FROM review_tasks WHERE tenant_id = $1 AND state = 'open' ORDER BY created_at DESC`,
    [tenantId],
  );
  return res.rows;
}

export async function updateReviewTaskState(
  client: DbClient,
  taskId: string,
  state: ReviewTaskState,
): Promise<void> {
  await client.query(
    `UPDATE review_tasks SET state = $1, updated_at = now() WHERE id = $2`,
    [state, taskId],
  );
}

// ============================================================
// approvals
// ============================================================

export interface InsertApprovalParams {
  tenantId:    string;
  taskId:      string;
  approverId:  string;
  decision:    ApprovalDecision;
  note?:       string | null;
}

export async function insertApproval(
  client: DbClient,
  params: InsertApprovalParams,
): Promise<ApprovalRow> {
  const id = uuidv4();
  const res = await client.query<ApprovalRow>(
    `INSERT INTO approvals (id, tenant_id, task_id, approver_id, decision, note)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      id,
      params.tenantId,
      params.taskId,
      params.approverId,
      params.decision,
      params.note ?? null,
    ],
  );
  return res.rows[0]!;
}

export async function getApproval(
  client: DbClient,
  approvalId: string,
): Promise<ApprovalRow | null> {
  const res = await client.query<ApprovalRow>(
    `SELECT * FROM approvals WHERE id = $1`,
    [approvalId],
  );
  return res.rows[0] ?? null;
}

export async function listApprovalsByTask(
  client: DbClient,
  taskId: string,
): Promise<ApprovalRow[]> {
  const res = await client.query<ApprovalRow>(
    `SELECT * FROM approvals WHERE task_id = $1 ORDER BY created_at ASC`,
    [taskId],
  );
  return res.rows;
}

// ============================================================
// comments (immutable — INSERT only)
// ============================================================

export interface InsertCommentParams {
  tenantId:  string;
  taskId:    string;
  authorId:  string;
  body:      string;
}

export async function insertComment(
  client: DbClient,
  params: InsertCommentParams,
): Promise<CommentRow> {
  const id = uuidv4();
  const res = await client.query<CommentRow>(
    `INSERT INTO comments (id, tenant_id, task_id, author_id, body)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [id, params.tenantId, params.taskId, params.authorId, params.body],
  );
  return res.rows[0]!;
}

export async function getComment(
  client: DbClient,
  commentId: string,
): Promise<CommentRow | null> {
  const res = await client.query<CommentRow>(
    `SELECT * FROM comments WHERE id = $1`,
    [commentId],
  );
  return res.rows[0] ?? null;
}

export async function listCommentsByTask(
  client: DbClient,
  taskId: string,
): Promise<CommentRow[]> {
  const res = await client.query<CommentRow>(
    `SELECT * FROM comments WHERE task_id = $1 ORDER BY created_at ASC`,
    [taskId],
  );
  return res.rows;
}
