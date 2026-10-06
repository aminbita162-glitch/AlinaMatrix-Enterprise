/**
 * Zod schemas for Phase 7: Human Review.
 * Covers: review tasks, approvals, comments, and claim-level decisions.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

// ============================================================
// Review task
// ============================================================

export const ReviewTaskStateSchema = z.enum(["open", "approved", "rejected"]);
export type ReviewTaskState = z.infer<typeof ReviewTaskStateSchema>;

export const CreateReviewTaskRequestSchema = z.object({
  workflowRunId:  z.string().uuid(),
  projectId:      z.string().uuid(),
  draftId:        z.string().uuid().nullable().optional(),
  authorId:       z.string().uuid(),
});
export type CreateReviewTaskRequest = z.infer<typeof CreateReviewTaskRequestSchema>;

export const ReviewTaskResponseSchema = z.object({
  id:              z.string().uuid(),
  tenantId:        z.string().uuid(),
  projectId:       z.string().uuid(),
  workflowRunId:   z.string().uuid(),
  draftId:         z.string().uuid().nullable(),
  authorId:        z.string().uuid(),
  state:           ReviewTaskStateSchema,
  createdAt:       z.string().datetime(),
  updatedAt:       z.string().datetime(),
});
export type ReviewTaskResponse = z.infer<typeof ReviewTaskResponseSchema>;

// ============================================================
// Approvals
// ============================================================

export const ApprovalDecisionSchema = z.enum(["approved", "rejected"]);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const CreateApprovalRequestSchema = z.object({
  approverId:  z.string().uuid(),
  decision:    ApprovalDecisionSchema,
  note:        z.string().max(4096).nullable().optional(),
});
export type CreateApprovalRequest = z.infer<typeof CreateApprovalRequestSchema>;

export const ApprovalResponseSchema = z.object({
  id:          z.string().uuid(),
  tenantId:    z.string().uuid(),
  taskId:      z.string().uuid(),
  approverId:  z.string().uuid(),
  decision:    ApprovalDecisionSchema,
  note:        z.string().nullable(),
  createdAt:   z.string().datetime(),
});
export type ApprovalResponse = z.infer<typeof ApprovalResponseSchema>;

// ============================================================
// Comments (immutable)
// ============================================================

export const CreateCommentRequestSchema = z.object({
  authorId: z.string().uuid(),
  body:     z.string().min(1).max(8192),
});
export type CreateCommentRequest = z.infer<typeof CreateCommentRequestSchema>;

export const CommentResponseSchema = z.object({
  id:        z.string().uuid(),
  tenantId:  z.string().uuid(),
  taskId:    z.string().uuid(),
  authorId:  z.string().uuid(),
  body:      z.string(),
  createdAt: z.string().datetime(),
});
export type CommentResponse = z.infer<typeof CommentResponseSchema>;

// ============================================================
// Claim-level decision
// ============================================================

export const ClaimDecisionRequestSchema = z.object({
  decision:   ApprovalDecisionSchema,
  reviewerId: z.string().uuid(),
});
export type ClaimDecisionRequest = z.infer<typeof ClaimDecisionRequestSchema>;
