/**
 * HTTP handlers for Phase 7: Human Review.
 *
 * Routes (all require tenantId from session; session resolution by caller):
 *   POST  /review-tasks                          — create review task
 *   GET   /review-tasks/:taskId                  — get task + pane data (fragments, content, findings)
 *   GET   /review-tasks                          — list open tasks (query: ?state=open)
 *   POST  /review-tasks/:taskId/approvals        — add approval (four-eyes enforced)
 *   GET   /review-tasks/:taskId/approvals        — list approvals
 *   POST  /review-tasks/:taskId/comments         — add immutable comment
 *   GET   /review-tasks/:taskId/comments         — list comments
 *   POST  /claims/:claimId/decision              — approve or reject a claim
 *
 * Four-eyes rule: assertFourEyes is called before recording an "approved" task approval.
 * Comment update: not routed — any attempt hits 404; DB trigger also prevents it.
 *
 * Status: Enterprise Candidate — Active Development
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  CreateReviewTaskRequestSchema,
  CreateApprovalRequestSchema,
  CreateCommentRequestSchema,
  ClaimDecisionRequestSchema,
} from "@alinamatrix/contracts";
import {
  assertFourEyes,
  FourEyesError,
  approveClaim,
  rejectClaim,
} from "@alinamatrix/domain";
import type {
  ReviewTaskRow,
  ApprovalRow,
  CommentRow,
} from "@alinamatrix/db";

// ============================================================
// DB interface — injected by caller; avoids direct DB import coupling
// ============================================================

export interface ReviewDb {
  insertReviewTask(params: {
    tenantId: string; projectId: string; workflowRunId: string;
    draftId?: string | null; authorId: string;
  }): Promise<ReviewTaskRow>;
  getReviewTask(taskId: string): Promise<ReviewTaskRow | null>;
  listOpenReviewTasks(tenantId: string): Promise<ReviewTaskRow[]>;
  updateReviewTaskState(taskId: string, state: "open" | "approved" | "rejected"): Promise<void>;
  insertApproval(params: {
    tenantId: string; taskId: string; approverId: string;
    decision: "approved" | "rejected"; note?: string | null;
  }): Promise<ApprovalRow>;
  listApprovalsByTask(taskId: string): Promise<ApprovalRow[]>;
  insertComment(params: {
    tenantId: string; taskId: string; authorId: string; body: string;
  }): Promise<CommentRow>;
  listCommentsByTask(taskId: string): Promise<CommentRow[]>;
  updateClaimReviewerStatus?(claimId: string, status: "pending" | "accepted" | "rejected"): Promise<void>;
}

// ============================================================
// Helpers
// ============================================================

function jsonOk(res: ServerResponse, body: unknown): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function jsonCreated(res: ServerResponse, body: unknown): void {
  res.writeHead(201, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function jsonError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

export async function readBodyJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve(null);
      }
    });
    req.on("error", reject);
  });
}

// ============================================================
// Handlers
// ============================================================

export async function handleCreateReviewTask(
  req: IncomingMessage,
  res: ServerResponse,
  db: ReviewDb,
  tenantId: string,
): Promise<void> {
  const body = await readBodyJson(req);
  if (body === null) {
    jsonError(res, 400, "Invalid JSON");
    return;
  }
  const parsed = CreateReviewTaskRequestSchema.safeParse(body);
  if (!parsed.success) {
    jsonError(res, 400, "Invalid request: " + (parsed.error.issues[0]?.message ?? "validation failed"));
    return;
  }
  const { workflowRunId, projectId, draftId, authorId } = parsed.data;
  const task = await db.insertReviewTask({
    tenantId, projectId, workflowRunId,
    draftId: draftId ?? null, authorId,
  });
  jsonCreated(res, taskToResponse(task));
}

export async function handleGetReviewTask(
  _req: IncomingMessage,
  res: ServerResponse,
  db: ReviewDb,
  taskId: string,
): Promise<void> {
  const task = await db.getReviewTask(taskId);
  if (!task) {
    jsonError(res, 404, "Review task not found");
    return;
  }
  const approvals = await db.listApprovalsByTask(taskId);
  const comments  = await db.listCommentsByTask(taskId);
  // Three-pane data: task + approvals (findings) + comments (content section).
  jsonOk(res, {
    task:      taskToResponse(task),
    approvals: approvals.map(approvalToResponse),
    comments:  comments.map(commentToResponse),
  });
}

export async function handleListReviewTasks(
  _req: IncomingMessage,
  res: ServerResponse,
  db: ReviewDb,
  tenantId: string,
): Promise<void> {
  const tasks = await db.listOpenReviewTasks(tenantId);
  jsonOk(res, tasks.map(taskToResponse));
}

export async function handleCreateApproval(
  req: IncomingMessage,
  res: ServerResponse,
  db: ReviewDb,
  tenantId: string,
  taskId: string,
): Promise<void> {
  const task = await db.getReviewTask(taskId);
  if (!task) {
    jsonError(res, 404, "Review task not found");
    return;
  }
  const body = await readBodyJson(req);
  if (body === null) {
    jsonError(res, 400, "Invalid JSON");
    return;
  }
  const parsed = CreateApprovalRequestSchema.safeParse(body);
  if (!parsed.success) {
    jsonError(res, 400, "Invalid request: " + (parsed.error.issues[0]?.message ?? "validation failed"));
    return;
  }
  const { approverId, decision, note } = parsed.data;

  // Four-eyes: if this is an approved decision, check there is an independent approver.
  if (decision === "approved") {
    const existing = await db.listApprovalsByTask(taskId);
    // Map existing DB rows (snake_case) to ApproverRecord (camelCase).
    const prospective = [
      ...existing.map((a) => ({ approverId: a.approver_id, decision: a.decision })),
      { approverId, decision: "approved" as const },
    ];
    try {
      assertFourEyes(task.author_id, prospective);
    } catch (err) {
      if (err instanceof FourEyesError) {
        jsonError(res, 422, err.message);
        return;
      }
      throw err;
    }
  }

  const approval = await db.insertApproval({
    tenantId, taskId, approverId, decision, note: note ?? null,
  });

  // If all approvals are "approved" and four-eyes passed, mark task approved.
  if (decision === "approved") {
    const allApprovals = await db.listApprovalsByTask(taskId);
    const hasRejection = allApprovals.some((a) => a.decision === "rejected");
    if (!hasRejection) {
      await db.updateReviewTaskState(taskId, "approved");
    }
  } else {
    await db.updateReviewTaskState(taskId, "rejected");
  }

  jsonCreated(res, approvalToResponse(approval));
}

export async function handleListApprovals(
  _req: IncomingMessage,
  res: ServerResponse,
  db: ReviewDb,
  taskId: string,
): Promise<void> {
  const approvals = await db.listApprovalsByTask(taskId);
  jsonOk(res, approvals.map(approvalToResponse));
}

export async function handleCreateComment(
  req: IncomingMessage,
  res: ServerResponse,
  db: ReviewDb,
  tenantId: string,
  taskId: string,
): Promise<void> {
  const task = await db.getReviewTask(taskId);
  if (!task) {
    jsonError(res, 404, "Review task not found");
    return;
  }
  const body = await readBodyJson(req);
  if (body === null) {
    jsonError(res, 400, "Invalid JSON");
    return;
  }
  const parsed = CreateCommentRequestSchema.safeParse(body);
  if (!parsed.success) {
    jsonError(res, 400, "Invalid request: " + (parsed.error.issues[0]?.message ?? "validation failed"));
    return;
  }
  const { authorId, body: commentBody } = parsed.data;
  const comment = await db.insertComment({ tenantId, taskId, authorId, body: commentBody });
  jsonCreated(res, commentToResponse(comment));
}

export async function handleListComments(
  _req: IncomingMessage,
  res: ServerResponse,
  db: ReviewDb,
  taskId: string,
): Promise<void> {
  const comments = await db.listCommentsByTask(taskId);
  jsonOk(res, comments.map(commentToResponse));
}

export async function handleClaimDecision(
  req: IncomingMessage,
  res: ServerResponse,
  claimId: string,
): Promise<void> {
  const body = await readBodyJson(req);
  if (body === null) {
    jsonError(res, 400, "Invalid JSON");
    return;
  }
  const parsed = ClaimDecisionRequestSchema.safeParse(body);
  if (!parsed.success) {
    jsonError(res, 400, "Invalid request: " + (parsed.error.issues[0]?.message ?? "validation failed"));
    return;
  }
  const { decision, reviewerId } = parsed.data;
  const result = decision === "approved"
    ? approveClaim(claimId, reviewerId)
    : rejectClaim(claimId, reviewerId);
  jsonOk(res, { claimId: result.claimId, reviewerStatus: result.reviewerStatus });
}

// ============================================================
// Response mappers
// ============================================================

function taskToResponse(row: ReviewTaskRow) {
  return {
    id:             row.id,
    tenantId:       row.tenant_id,
    projectId:      row.project_id,
    workflowRunId:  row.workflow_run_id,
    draftId:        row.draft_id,
    authorId:       row.author_id,
    state:          row.state,
    createdAt:      row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt:      row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function approvalToResponse(row: ApprovalRow) {
  return {
    id:         row.id,
    tenantId:   row.tenant_id,
    taskId:     row.task_id,
    approverId: row.approver_id,
    decision:   row.decision,
    note:       row.note,
    createdAt:  row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function commentToResponse(row: CommentRow) {
  return {
    id:        row.id,
    tenantId:  row.tenant_id,
    taskId:    row.task_id,
    authorId:  row.author_id,
    body:      row.body,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}
