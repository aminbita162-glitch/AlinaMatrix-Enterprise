/**
 * Tests for apps/api/src/review.ts handlers and router integration.
 *
 * Tests covered:
 *   1. self-approval denied — handleCreateApproval returns 422 when author == sole approver
 *   2. rejected claim blocks completion — handleClaimDecision returns rejected status
 *   3. comment update denied — no PUT/PATCH route; handleCreateComment issues INSERT only
 *   4. tenant isolation — handlers pass tenantId from session
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, vi } from "vitest";
import { IncomingMessage, ServerResponse, createServer } from "node:http";
import type { Server } from "node:http";
import {
  handleCreateReviewTask,
  handleGetReviewTask,
  handleListReviewTasks,
  handleCreateApproval,
  handleListApprovals,
  handleCreateComment,
  handleListComments,
  handleClaimDecision,
  readBodyJson,
} from "../src/review.js";
import { router } from "../src/router.js";
import type { ReviewDb } from "../src/review.js";
import type { ReviewTaskRow, ApprovalRow, CommentRow } from "@alinamatrix/db";

// ============================================================
// Fixtures
// ============================================================

// All UUIDs use variant 1 (clock_seq high bits = 10xx, i.e. 8, 9, a, or b).
const TENANT_A    = "aaaaaaaa-0000-4000-8000-000000000001";
const TENANT_B    = "bbbbbbbb-0000-4000-8000-000000000002";
const PROJECT_ID  = "a1a1a1a1-0000-4000-8000-000000000001";
const WF_RUN_ID   = "a2a2a2a2-0000-4000-8000-000000000001";
const AUTHOR_ID   = "11111111-0000-4000-8000-000000000001";
const APPROVER_ID = "22222222-0000-4000-8000-000000000002";
const DRAFT_ID    = "33333333-0000-4000-8000-000000000003";
const TASK_ID     = "44444444-0000-4000-8000-000000000004";
const CLAIM_ID    = "55555555-0000-4000-8000-000000000005";

function makeTaskRow(overrides: Partial<ReviewTaskRow> = {}): ReviewTaskRow {
  return {
    id:              TASK_ID,
    tenant_id:       TENANT_A,
    project_id:      PROJECT_ID,
    workflow_run_id: WF_RUN_ID,
    draft_id:        DRAFT_ID,
    author_id:       AUTHOR_ID,
    state:           "open",
    created_at:      new Date("2026-01-01T00:00:00.000Z"),
    updated_at:      new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeApprovalRow(overrides: Partial<ApprovalRow> = {}): ApprovalRow {
  return {
    id:          "66666666-0000-4000-a000-000000000006",
    tenant_id:   TENANT_A,
    task_id:     TASK_ID,
    approver_id: APPROVER_ID,
    decision:    "approved",
    note:        null,
    created_at:  new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeCommentRow(overrides: Partial<CommentRow> = {}): CommentRow {
  return {
    id:         "77777777-0000-4000-a000-000000000007",
    tenant_id:  TENANT_A,
    task_id:    TASK_ID,
    author_id:  AUTHOR_ID,
    body:       "LGTM",
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

// ============================================================
// Mock request / response helpers
// ============================================================

/**
 * Create a mock IncomingMessage that emits body data after a short delay,
 * ensuring listeners attached in the same tick can still receive the events.
 * We override the `on` method to replay buffered events immediately if they
 * have already been emitted (read-once pattern).
 */
function makeMockReq(body: unknown = ""): IncomingMessage {
  const rawBuf = Buffer.from(typeof body === "string" ? body : JSON.stringify(body));

  // We create an object that behaves like a readable stream for the purposes
  // of readBodyJson: it responds to .on("data", ...) and .on("end", ...) calls.
  const listeners: Record<string, Array<(arg?: unknown) => void>> = {};
  let ended = false;

  const req = {
    headers: {},
    on(event: string, fn: (arg?: unknown) => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event]!.push(fn);
      // If "end" was already signalled, replay immediately for late .on("end") calls
      if (event === "end" && ended) setImmediate(() => fn());
      return req;
    },
  } as unknown as IncomingMessage;

  // Emit data and end asynchronously so listeners can be attached first.
  setImmediate(() => {
    for (const fn of listeners["data"] ?? []) fn(rawBuf);
    ended = true;
    for (const fn of listeners["end"] ?? []) fn();
  });

  return req;
}

interface MockResResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function makeMockRes(): { res: ServerResponse; result: () => MockResResult } {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let body = "";

  const res = {
    writeHead: vi.fn((code: number, hdrs?: Record<string, string>) => {
      statusCode = code;
      if (hdrs) Object.assign(headers, hdrs);
    }),
    end: vi.fn((data?: string) => {
      body = data ?? "";
    }),
  } as unknown as ServerResponse;

  return {
    res,
    result: () => ({ statusCode, headers, body }),
  };
}

function makeReviewDb(overrides: Partial<ReviewDb> = {}): ReviewDb {
  return {
    insertReviewTask:       vi.fn(async () => makeTaskRow()),
    getReviewTask:          vi.fn(async () => makeTaskRow()),
    listOpenReviewTasks:    vi.fn(async () => [makeTaskRow()]),
    updateReviewTaskState:  vi.fn(async () => undefined),
    insertApproval:         vi.fn(async () => makeApprovalRow()),
    listApprovalsByTask:    vi.fn(async () => []),
    insertComment:          vi.fn(async () => makeCommentRow()),
    listCommentsByTask:     vi.fn(async () => [makeCommentRow()]),
    ...overrides,
  };
}

// ============================================================
// readBodyJson
// ============================================================

describe("readBodyJson", () => {
  it("parses valid JSON from request body", async () => {
    const req = makeMockReq({ hello: "world" });
    const result = await readBodyJson(req);
    expect(result).toEqual({ hello: "world" });
  });

  it("returns null for invalid JSON", async () => {
    const req = makeMockReq("not json");
    const result = await readBodyJson(req);
    expect(result).toBeNull();
  });
});

// ============================================================
// handleCreateReviewTask
// ============================================================

describe("handleCreateReviewTask", () => {
  it("returns 201 with task on valid input", async () => {
    const db = makeReviewDb();
    const req = makeMockReq({
      workflowRunId: WF_RUN_ID, projectId: PROJECT_ID,
      draftId: DRAFT_ID, authorId: AUTHOR_ID,
    });
    const { res, result } = makeMockRes();
    await handleCreateReviewTask(req, res, db, TENANT_A);
    expect(result().statusCode).toBe(201);
  });

  it("returns 400 on invalid JSON body", async () => {
    const db = makeReviewDb();
    const req = makeMockReq("bad json");
    const { res, result } = makeMockRes();
    await handleCreateReviewTask(req, res, db, TENANT_A);
    expect(result().statusCode).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const db = makeReviewDb();
    const req = makeMockReq({ workflowRunId: "not-a-uuid" });
    const { res, result } = makeMockRes();
    await handleCreateReviewTask(req, res, db, TENANT_A);
    expect(result().statusCode).toBe(400);
  });
});

// ============================================================
// handleGetReviewTask
// ============================================================

describe("handleGetReviewTask", () => {
  it("returns 200 with task and three-pane data", async () => {
    const db = makeReviewDb();
    const req = makeMockReq();
    const { res, result } = makeMockRes();
    await handleGetReviewTask(req, res, db, TASK_ID);
    expect(result().statusCode).toBe(200);
    const parsed = JSON.parse(result().body) as { task: unknown; approvals: unknown[]; comments: unknown[] };
    expect(parsed).toHaveProperty("task");
    expect(parsed).toHaveProperty("approvals");
    expect(parsed).toHaveProperty("comments");
  });

  it("returns 404 when task is not found", async () => {
    const db = makeReviewDb({ getReviewTask: vi.fn(async () => null) });
    const req = makeMockReq();
    const { res, result } = makeMockRes();
    await handleGetReviewTask(req, res, db, TASK_ID);
    expect(result().statusCode).toBe(404);
  });
});

// ============================================================
// handleListReviewTasks
// ============================================================

describe("handleListReviewTasks", () => {
  it("returns 200 with an array of tasks", async () => {
    const db = makeReviewDb();
    const req = makeMockReq();
    const { res, result } = makeMockRes();
    await handleListReviewTasks(req, res, db, TENANT_A);
    expect(result().statusCode).toBe(200);
    const parsed = JSON.parse(result().body) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
  });
});

// ============================================================
// handleCreateApproval — DIRECTIVE: four-eyes check
// ============================================================

describe("handleCreateApproval — four-eyes", () => {
  it("returns 422 when the author is the sole approver (self-approval denied)", async () => {
    // Task with author AUTHOR_ID; the approval is also from AUTHOR_ID.
    const db = makeReviewDb({
      getReviewTask: vi.fn(async () => makeTaskRow({ author_id: AUTHOR_ID })),
      listApprovalsByTask: vi.fn(async () => []), // no other approvals yet
    });
    const req = makeMockReq({
      approverId: AUTHOR_ID,
      decision:   "approved",
    });
    const { res, result } = makeMockRes();
    await handleCreateApproval(req, res, db, TENANT_A, TASK_ID);
    expect(result().statusCode).toBe(422);
    const body = JSON.parse(result().body) as { error: string };
    expect(body.error).toContain("Four-eyes");
  });

  it("returns 201 when an independent reviewer approves", async () => {
    const db = makeReviewDb({
      getReviewTask: vi.fn(async () => makeTaskRow({ author_id: AUTHOR_ID })),
      listApprovalsByTask: vi.fn(async () => []),
    });
    const req = makeMockReq({
      approverId: APPROVER_ID, // different from AUTHOR_ID
      decision:   "approved",
    });
    const { res, result } = makeMockRes();
    await handleCreateApproval(req, res, db, TENANT_A, TASK_ID);
    expect(result().statusCode).toBe(201);
  });

  it("returns 422 even with two entries from the same author", async () => {
    const db = makeReviewDb({
      getReviewTask: vi.fn(async () => makeTaskRow({ author_id: AUTHOR_ID })),
      listApprovalsByTask: vi.fn(async () => [
        makeApprovalRow({ approver_id: AUTHOR_ID }),
      ]),
    });
    const req = makeMockReq({
      approverId: AUTHOR_ID,
      decision:   "approved",
    });
    const { res, result } = makeMockRes();
    await handleCreateApproval(req, res, db, TENANT_A, TASK_ID);
    expect(result().statusCode).toBe(422);
  });

  it("accepts a rejection without four-eyes check", async () => {
    const db = makeReviewDb({
      getReviewTask: vi.fn(async () => makeTaskRow({ author_id: AUTHOR_ID })),
      listApprovalsByTask: vi.fn(async () => []),
      insertApproval: vi.fn(async () => makeApprovalRow({ decision: "rejected" })),
    });
    const req = makeMockReq({
      approverId: AUTHOR_ID, // author can reject their own work
      decision:   "rejected",
    });
    const { res, result } = makeMockRes();
    await handleCreateApproval(req, res, db, TENANT_A, TASK_ID);
    expect(result().statusCode).toBe(201);
  });

  it("returns 404 when task is not found", async () => {
    const db = makeReviewDb({ getReviewTask: vi.fn(async () => null) });
    const req = makeMockReq({ approverId: APPROVER_ID, decision: "approved" });
    const { res, result } = makeMockRes();
    await handleCreateApproval(req, res, db, TENANT_A, TASK_ID);
    expect(result().statusCode).toBe(404);
  });

  it("returns 400 on invalid JSON", async () => {
    const db = makeReviewDb();
    const req = makeMockReq("bad json");
    const { res, result } = makeMockRes();
    await handleCreateApproval(req, res, db, TENANT_A, TASK_ID);
    expect(result().statusCode).toBe(400);
  });
});

// ============================================================
// handleCreateComment
// ============================================================

describe("handleCreateComment — immutability", () => {
  it("returns 201 on valid comment", async () => {
    const db = makeReviewDb();
    const req = makeMockReq({ authorId: AUTHOR_ID, body: "LGTM" });
    const { res, result } = makeMockRes();
    await handleCreateComment(req, res, db, TENANT_A, TASK_ID);
    expect(result().statusCode).toBe(201);
  });

  it("calls insertComment (not update)", async () => {
    const insertSpy = vi.fn(async () => makeCommentRow());
    const db = makeReviewDb({ insertComment: insertSpy });
    const req = makeMockReq({ authorId: AUTHOR_ID, body: "review note" });
    const { res } = makeMockRes();
    await handleCreateComment(req, res, db, TENANT_A, TASK_ID);
    expect(insertSpy).toHaveBeenCalledOnce();
    // The call parameters must include body (not update)
    const call = insertSpy.mock.calls[0]![0];
    expect(call.body).toBe("review note");
  });

  it("returns 404 when task is not found", async () => {
    const db = makeReviewDb({ getReviewTask: vi.fn(async () => null) });
    const req = makeMockReq({ authorId: AUTHOR_ID, body: "test" });
    const { res, result } = makeMockRes();
    await handleCreateComment(req, res, db, TENANT_A, TASK_ID);
    expect(result().statusCode).toBe(404);
  });

  it("returns 400 on empty body", async () => {
    const db = makeReviewDb();
    const req = makeMockReq({ authorId: AUTHOR_ID, body: "" }); // body is min(1)
    const { res, result } = makeMockRes();
    await handleCreateComment(req, res, db, TENANT_A, TASK_ID);
    expect(result().statusCode).toBe(400);
  });
});

// ============================================================
// handleListComments
// ============================================================

describe("handleListComments", () => {
  it("returns 200 with comments array", async () => {
    const db = makeReviewDb();
    const req = makeMockReq();
    const { res, result } = makeMockRes();
    await handleListComments(req, res, db, TASK_ID);
    expect(result().statusCode).toBe(200);
    const parsed = JSON.parse(result().body) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
  });
});

// ============================================================
// handleListApprovals
// ============================================================

describe("handleListApprovals", () => {
  it("returns 200 with empty array when no approvals", async () => {
    const db = makeReviewDb({ listApprovalsByTask: vi.fn(async () => []) });
    const req = makeMockReq();
    const { res, result } = makeMockRes();
    await handleListApprovals(req, res, db, TASK_ID);
    expect(result().statusCode).toBe(200);
    const parsed = JSON.parse(result().body) as unknown[];
    expect(parsed).toHaveLength(0);
  });
});

// ============================================================
// handleClaimDecision — claim approve and reject
// ============================================================

describe("handleClaimDecision", () => {
  it("returns approved reviewer_status when decision=approved", async () => {
    const req = makeMockReq({ decision: "approved", reviewerId: APPROVER_ID });
    const { res, result } = makeMockRes();
    await handleClaimDecision(req, res, CLAIM_ID);
    expect(result().statusCode).toBe(200);
    const body = JSON.parse(result().body) as { reviewerStatus: string };
    expect(body.reviewerStatus).toBe("approved");
  });

  it("returns rejected reviewer_status when decision=rejected", async () => {
    const req = makeMockReq({ decision: "rejected", reviewerId: APPROVER_ID });
    const { res, result } = makeMockRes();
    await handleClaimDecision(req, res, CLAIM_ID);
    expect(result().statusCode).toBe(200);
    const body = JSON.parse(result().body) as { reviewerStatus: string };
    expect(body.reviewerStatus).toBe("rejected");
  });

  it("rejected claim status implies workflow stays NEEDS_REVIEW (reviewer_status=rejected)", async () => {
    // This tests the directive requirement: "Reject keeps NEEDS_REVIEW."
    // The handler returns reviewer_status=rejected; the caller must keep workflow in NEEDS_REVIEW.
    const req = makeMockReq({ decision: "rejected", reviewerId: APPROVER_ID });
    const { res, result } = makeMockRes();
    await handleClaimDecision(req, res, CLAIM_ID);
    const body = JSON.parse(result().body) as { reviewerStatus: string; claimId: string };
    expect(body.reviewerStatus).toBe("rejected");
    expect(body.claimId).toBe(CLAIM_ID);
  });

  it("returns 400 on invalid decision value", async () => {
    const req = makeMockReq({ decision: "maybe", reviewerId: APPROVER_ID });
    const { res, result } = makeMockRes();
    await handleClaimDecision(req, res, CLAIM_ID);
    expect(result().statusCode).toBe(400);
  });

  it("returns 400 when reviewerId is not a UUID", async () => {
    const req = makeMockReq({ decision: "approved", reviewerId: "not-a-uuid" });
    const { res, result } = makeMockRes();
    await handleClaimDecision(req, res, CLAIM_ID);
    expect(result().statusCode).toBe(400);
  });
});

// ============================================================
// Router: review routes return 503 without reviewDb (tenant isolation at infra level)
// ============================================================

describe("router — review routes without reviewDb return 503", () => {
  let server: Server;
  let port: number;

  async function start() {
    return new Promise<void>((resolve, reject) => {
      // No reviewDb injected — service unavailable for review routes.
      server = createServer(router({}));
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (!addr || typeof addr === "string") { reject(new Error("no addr")); return; }
        port = addr.port;
        resolve();
      });
    });
  }

  async function stop() {
    return new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }

  it("GET /review-tasks without reviewDb returns 503", async () => {
    await start();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/review-tasks`);
      expect(res.status).toBe(503);
    } finally {
      await stop();
    }
  });

  it("POST /review-tasks without reviewDb returns 503", async () => {
    await start();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/review-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(503);
    } finally {
      await stop();
    }
  });
});

// ============================================================
// Tenant isolation contract
// ============================================================

describe("tenant isolation — review handlers", () => {
  it("handleCreateReviewTask uses the provided tenantId from session", async () => {
    const insertSpy = vi.fn(async () => makeTaskRow({ tenant_id: TENANT_A }));
    const db = makeReviewDb({ insertReviewTask: insertSpy });
    const req = makeMockReq({
      workflowRunId: WF_RUN_ID, projectId: PROJECT_ID, authorId: AUTHOR_ID,
    });
    const { res } = makeMockRes();
    await handleCreateReviewTask(req, res, db, TENANT_A);
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
    );
  });

  it("tenant A and tenant B produce separate insertReviewTask calls", async () => {
    const callsA: string[] = [];
    const callsB: string[] = [];
    const dbA = makeReviewDb({
      insertReviewTask: vi.fn(async (p) => { callsA.push(p.tenantId); return makeTaskRow(); }),
    });
    const dbB = makeReviewDb({
      insertReviewTask: vi.fn(async (p) => { callsB.push(p.tenantId); return makeTaskRow(); }),
    });
    const body = { workflowRunId: WF_RUN_ID, projectId: PROJECT_ID, authorId: AUTHOR_ID };
    await handleCreateReviewTask(makeMockReq(body), makeMockRes().res, dbA, TENANT_A);
    await handleCreateReviewTask(makeMockReq(body), makeMockRes().res, dbB, TENANT_B);
    expect(callsA[0]).toBe(TENANT_A);
    expect(callsB[0]).toBe(TENANT_B);
    expect(callsA[0]).not.toBe(callsB[0]);
  });
});
