/**
 * Unit tests for packages/db/src/review.ts — review tasks, approvals, comments.
 *
 * Uses a mock pg client (no live database required).
 * Also inspects migration 006 SQL for structural correctness.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  insertReviewTask,
  getReviewTask,
  getReviewTaskByRun,
  listReviewTasksByProject,
  updateReviewTaskState,
  insertApproval,
  getApproval,
  listApprovalsByTask,
  insertComment,
  getComment,
  listCommentsByTask,
} from "./review.js";
import type { ReviewTaskRow, ApprovalRow, CommentRow } from "./review.js";
import type { DbClient } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(__dirname, "../migrations/006_human_review.sql");

// ---------------------------------------------------------------------------
// Mock client
// ---------------------------------------------------------------------------

function makeMockClient(rows: unknown[] = []): {
  client: DbClient;
  calls: Array<{ text: string; values: unknown[] }>;
} {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const client = {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      calls.push({ text, values: values ?? [] });
      return { rows, rowCount: rows.length };
    }),
  } as unknown as DbClient;
  return { client, calls };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_A    = "aaaaaaaa-0000-4000-a000-000000000001";
const TENANT_B    = "bbbbbbbb-0000-4000-b000-000000000002";
const PROJECT_ID  = "cccccccc-0000-4000-c000-000000000001";
const WF_RUN_ID   = "dddddddd-0000-4000-d000-000000000001";
const AUTHOR_ID   = "11111111-0000-4000-a000-000000000001";
const APPROVER_ID = "22222222-0000-4000-a000-000000000002";
const DRAFT_ID    = "33333333-0000-4000-a000-000000000003";
const TASK_ID     = "44444444-0000-4000-a000-000000000004";
const COMMENT_ID  = "55555555-0000-4000-a000-000000000005";
const APPROVAL_ID = "66666666-0000-4000-a000-000000000006";

function makeTaskRow(overrides: Partial<ReviewTaskRow> = {}): ReviewTaskRow {
  return {
    id:              TASK_ID,
    tenant_id:       TENANT_A,
    project_id:      PROJECT_ID,
    workflow_run_id: WF_RUN_ID,
    draft_id:        DRAFT_ID,
    author_id:       AUTHOR_ID,
    state:           "open",
    created_at:      new Date(),
    updated_at:      new Date(),
    ...overrides,
  };
}

function makeApprovalRow(overrides: Partial<ApprovalRow> = {}): ApprovalRow {
  return {
    id:          APPROVAL_ID,
    tenant_id:   TENANT_A,
    task_id:     TASK_ID,
    approver_id: APPROVER_ID,
    decision:    "approved",
    note:        null,
    created_at:  new Date(),
    ...overrides,
  };
}

function makeCommentRow(overrides: Partial<CommentRow> = {}): CommentRow {
  return {
    id:         COMMENT_ID,
    tenant_id:  TENANT_A,
    task_id:    TASK_ID,
    author_id:  AUTHOR_ID,
    body:       "LGTM",
    created_at: new Date(),
    ...overrides,
  };
}

// ===========================================================================
// Migration SQL structural tests
// ===========================================================================

describe("migration 006 SQL structural checks", () => {
  let sql = "";

  it("migration file can be read", async () => {
    sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql.length).toBeGreaterThan(200);
  });

  it("creates review_tasks table", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("CREATE TABLE review_tasks");
  });

  it("creates approvals table", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("CREATE TABLE approvals");
  });

  it("creates comments table", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("CREATE TABLE comments");
  });

  it("comments have immutability trigger", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("comments_immutable");
    expect(sql).toContain("BEFORE UPDATE ON comments");
    expect(sql).toContain("BEFORE DELETE ON comments");
  });

  it("comments GRANT excludes UPDATE and DELETE", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    // Only SELECT and INSERT are granted on comments.
    expect(sql).toContain("GRANT SELECT, INSERT ON comments TO app_user");
    // Must NOT grant UPDATE or DELETE on comments.
    expect(sql).not.toMatch(/GRANT.*UPDATE.*ON comments/i);
    expect(sql).not.toMatch(/GRANT.*DELETE.*ON comments/i);
  });

  it("RLS enabled and forced on review_tasks", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("FORCE  ROW LEVEL SECURITY");
    expect(sql).toContain("review_tasks_tenant");
  });

  it("RLS enabled on approvals and comments", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("approvals_tenant");
    expect(sql).toContain("comments_tenant");
  });

  it("migration registry entry present", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("INSERT INTO schema_migrations");
    expect(sql).toContain("006_human_review");
  });

  it("four-eyes constraint: author_id column present in review_tasks", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("author_id");
  });

  it("review_tasks has UNIQUE constraint on workflow_run_id", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("UNIQUE (workflow_run_id)");
  });
});

// ===========================================================================
// insertReviewTask
// ===========================================================================

describe("insertReviewTask", () => {
  it("inserts a task and returns the row", async () => {
    const expected = makeTaskRow();
    const { client } = makeMockClient([expected]);
    const result = await insertReviewTask(client, {
      tenantId: TENANT_A, projectId: PROJECT_ID,
      workflowRunId: WF_RUN_ID, draftId: DRAFT_ID, authorId: AUTHOR_ID,
    });
    expect(result.id).toBe(TASK_ID);
    expect(result.state).toBe("open");
  });

  it("uses ON CONFLICT DO NOTHING — returns existing row on duplicate run", async () => {
    const existing = makeTaskRow();
    // First call (INSERT) returns nothing (conflict), second (SELECT) returns existing.
    let callCount = 0;
    const client = {
      query: vi.fn(async () => {
        callCount++;
        return callCount === 1 ? { rows: [], rowCount: 0 } : { rows: [existing], rowCount: 1 };
      }),
    } as unknown as DbClient;
    const result = await insertReviewTask(client, {
      tenantId: TENANT_A, projectId: PROJECT_ID,
      workflowRunId: WF_RUN_ID, draftId: DRAFT_ID, authorId: AUTHOR_ID,
    });
    expect(result.id).toBe(TASK_ID);
  });

  it("stores null draft_id when not provided", async () => {
    const expected = makeTaskRow({ draft_id: null });
    const { client, calls } = makeMockClient([expected]);
    await insertReviewTask(client, {
      tenantId: TENANT_A, projectId: PROJECT_ID,
      workflowRunId: WF_RUN_ID, authorId: AUTHOR_ID,
    });
    // draft_id parameter ($5) should be null.
    expect(calls[0]?.values[4]).toBeNull();
  });
});

// ===========================================================================
// getReviewTask
// ===========================================================================

describe("getReviewTask", () => {
  it("returns the task row when found", async () => {
    const expected = makeTaskRow();
    const { client } = makeMockClient([expected]);
    const result = await getReviewTask(client, TASK_ID);
    expect(result?.id).toBe(TASK_ID);
  });

  it("returns null when not found", async () => {
    const { client } = makeMockClient([]);
    const result = await getReviewTask(client, TASK_ID);
    expect(result).toBeNull();
  });
});

// ===========================================================================
// getReviewTaskByRun
// ===========================================================================

describe("getReviewTaskByRun", () => {
  it("returns the task for a given workflow_run_id", async () => {
    const expected = makeTaskRow();
    const { client } = makeMockClient([expected]);
    const result = await getReviewTaskByRun(client, WF_RUN_ID);
    expect(result.workflow_run_id).toBe(WF_RUN_ID);
  });

  it("throws when no task found for workflow_run_id", async () => {
    const { client } = makeMockClient([]);
    await expect(getReviewTaskByRun(client, WF_RUN_ID)).rejects.toThrow(
      `Review task not found for workflow_run_id: ${WF_RUN_ID}`,
    );
  });
});

// ===========================================================================
// updateReviewTaskState
// ===========================================================================

describe("updateReviewTaskState", () => {
  it("issues an UPDATE with the new state", async () => {
    const { client, calls } = makeMockClient([]);
    await updateReviewTaskState(client, TASK_ID, "approved");
    expect(calls[0]?.text).toContain("UPDATE review_tasks");
    expect(calls[0]?.values[0]).toBe("approved");
    expect(calls[0]?.values[1]).toBe(TASK_ID);
  });

  it("can set state to rejected", async () => {
    const { client, calls } = makeMockClient([]);
    await updateReviewTaskState(client, TASK_ID, "rejected");
    expect(calls[0]?.values[0]).toBe("rejected");
  });
});

// ===========================================================================
// insertApproval
// ===========================================================================

describe("insertApproval", () => {
  it("inserts an approval and returns the row", async () => {
    const expected = makeApprovalRow();
    const { client } = makeMockClient([expected]);
    const result = await insertApproval(client, {
      tenantId: TENANT_A, taskId: TASK_ID, approverId: APPROVER_ID, decision: "approved",
    });
    expect(result.decision).toBe("approved");
    expect(result.approver_id).toBe(APPROVER_ID);
  });

  it("stores a rejected decision", async () => {
    const expected = makeApprovalRow({ decision: "rejected" });
    const { client } = makeMockClient([expected]);
    const result = await insertApproval(client, {
      tenantId: TENANT_A, taskId: TASK_ID, approverId: APPROVER_ID, decision: "rejected",
    });
    expect(result.decision).toBe("rejected");
  });

  it("stores an optional note", async () => {
    const expected = makeApprovalRow({ note: "Checked citations." });
    const { client, calls } = makeMockClient([expected]);
    await insertApproval(client, {
      tenantId: TENANT_A, taskId: TASK_ID, approverId: APPROVER_ID,
      decision: "approved", note: "Checked citations.",
    });
    expect(calls[0]?.values[5]).toBe("Checked citations.");
  });

  it("sends null note when not provided", async () => {
    const expected = makeApprovalRow();
    const { client, calls } = makeMockClient([expected]);
    await insertApproval(client, {
      tenantId: TENANT_A, taskId: TASK_ID, approverId: APPROVER_ID, decision: "approved",
    });
    expect(calls[0]?.values[5]).toBeNull();
  });
});

// ===========================================================================
// listApprovalsByTask
// ===========================================================================

describe("listApprovalsByTask", () => {
  it("returns all approvals for a task", async () => {
    const rows = [makeApprovalRow(), makeApprovalRow({ approver_id: "99999999-0000-4000-a000-000000000009" })];
    const { client } = makeMockClient(rows);
    const result = await listApprovalsByTask(client, TASK_ID);
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no approvals", async () => {
    const { client } = makeMockClient([]);
    const result = await listApprovalsByTask(client, TASK_ID);
    expect(result).toHaveLength(0);
  });
});

// ===========================================================================
// insertComment
// ===========================================================================

describe("insertComment", () => {
  it("inserts a comment and returns the row", async () => {
    const expected = makeCommentRow();
    const { client } = makeMockClient([expected]);
    const result = await insertComment(client, {
      tenantId: TENANT_A, taskId: TASK_ID, authorId: AUTHOR_ID, body: "LGTM",
    });
    expect(result.body).toBe("LGTM");
    expect(result.id).toBe(COMMENT_ID);
  });

  it("only issues an INSERT (no UPDATE)", async () => {
    const expected = makeCommentRow();
    const { client, calls } = makeMockClient([expected]);
    await insertComment(client, {
      tenantId: TENANT_A, taskId: TASK_ID, authorId: AUTHOR_ID, body: "test",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain("INSERT INTO comments");
    expect(calls[0]?.text).not.toContain("UPDATE");
  });
});

// ===========================================================================
// getComment
// ===========================================================================

describe("getComment", () => {
  it("returns the comment when found", async () => {
    const expected = makeCommentRow();
    const { client } = makeMockClient([expected]);
    const result = await getComment(client, COMMENT_ID);
    expect(result?.id).toBe(COMMENT_ID);
  });

  it("returns null when not found", async () => {
    const { client } = makeMockClient([]);
    const result = await getComment(client, COMMENT_ID);
    expect(result).toBeNull();
  });
});

// ===========================================================================
// listCommentsByTask
// ===========================================================================

describe("listCommentsByTask", () => {
  it("returns all comments for a task in order", async () => {
    const rows = [makeCommentRow({ body: "First" }), makeCommentRow({ body: "Second" })];
    const { client } = makeMockClient(rows);
    const result = await listCommentsByTask(client, TASK_ID);
    expect(result).toHaveLength(2);
    expect(result[0]?.body).toBe("First");
  });

  it("returns empty array when no comments", async () => {
    const { client } = makeMockClient([]);
    const result = await listCommentsByTask(client, TASK_ID);
    expect(result).toHaveLength(0);
  });
});

// ===========================================================================
// Tenant isolation contract
// ===========================================================================

describe("tenant isolation — DB layer contract", () => {
  it("insertReviewTask passes tenant_id as second parameter", async () => {
    const expected = makeTaskRow();
    const { client, calls } = makeMockClient([expected]);
    await insertReviewTask(client, {
      tenantId: TENANT_A, projectId: PROJECT_ID,
      workflowRunId: WF_RUN_ID, authorId: AUTHOR_ID,
    });
    // $2 is tenant_id in the INSERT
    expect(calls[0]?.values[1]).toBe(TENANT_A);
  });

  it("tenant A and tenant B use different tenant_id values", async () => {
    const rowA = makeTaskRow({ tenant_id: TENANT_A });
    const rowB = makeTaskRow({ tenant_id: TENANT_B });
    const { client: cA, calls: callsA } = makeMockClient([rowA]);
    const { client: cB, calls: callsB } = makeMockClient([rowB]);
    await insertReviewTask(cA, {
      tenantId: TENANT_A, projectId: PROJECT_ID,
      workflowRunId: WF_RUN_ID, authorId: AUTHOR_ID,
    });
    await insertReviewTask(cB, {
      tenantId: TENANT_B, projectId: PROJECT_ID,
      workflowRunId: WF_RUN_ID, authorId: AUTHOR_ID,
    });
    expect(callsA[0]?.values[1]).toBe(TENANT_A);
    expect(callsB[0]?.values[1]).toBe(TENANT_B);
    expect(callsA[0]?.values[1]).not.toBe(callsB[0]?.values[1]);
  });

  it("insertApproval passes tenant_id", async () => {
    const expected = makeApprovalRow();
    const { client, calls } = makeMockClient([expected]);
    await insertApproval(client, {
      tenantId: TENANT_A, taskId: TASK_ID, approverId: APPROVER_ID, decision: "approved",
    });
    expect(calls[0]?.values[1]).toBe(TENANT_A);
  });

  it("insertComment passes tenant_id", async () => {
    const expected = makeCommentRow();
    const { client, calls } = makeMockClient([expected]);
    await insertComment(client, {
      tenantId: TENANT_A, taskId: TASK_ID, authorId: AUTHOR_ID, body: "note",
    });
    expect(calls[0]?.values[1]).toBe(TENANT_A);
  });
});
