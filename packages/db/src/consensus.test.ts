/**
 * Unit tests for packages/db/src/consensus.ts — consensus decision events
 * (Phase E Unit 2).
 *
 * Uses a mock pg client (no live database required).
 * Also inspects migration 014 SQL for structural correctness.
 *
 * Covers:
 *   - insertConsensusDecisionEvent inserts (append-only); only INSERT, no UPDATE.
 *   - listConsensusDecisionEventsByTask queries by review_task_id.
 *   - countConsensusApprovals counts approved events.
 *   - countConsensusRejections counts rejected events.
 *   - Migration 014 SQL: table, RLS, immutability triggers, GRANT, registry.
 *
 * Directive Phase E:
 *   "Decision event append-only. ... Tenant isolated."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  insertConsensusDecisionEvent,
  listConsensusDecisionEventsByTask,
  countConsensusApprovals,
  countConsensusRejections,
} from "./consensus.js";
import type { ConsensusDecisionEventRow } from "./consensus.js";
import type { DbClient } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(__dirname, "../migrations/014_consensus_decision_events.sql");

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

const TENANT_A       = "aaaaaaaa-0000-4000-a000-000000000001";
const REVIEW_TASK_ID = "rrrrrrrr-0000-4000-r000-000000000001";
const APPROVER_ID    = "cccccccc-0000-4000-c000-000000000003";
const NOW            = new Date("2026-10-06T12:00:00.000Z");

function makeEventRow(overrides: Partial<ConsensusDecisionEventRow> = {}): ConsensusDecisionEventRow {
  return {
    id:              "eeeeeeee-0000-4000-e000-000000000005",
    tenant_id:       TENANT_A,
    review_task_id:  REVIEW_TASK_ID,
    approver_id:     APPROVER_ID,
    decision:        "approved",
    decided_at:      NOW,
    created_at:      NOW,
    ...overrides,
  };
}

// ===========================================================================
// Migration 014 SQL structural tests
// ===========================================================================

describe("migration 014 SQL structural checks", () => {
  let sql = "";

  it("migration file can be read", async () => {
    sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql.length).toBeGreaterThan(200);
  });

  it("creates consensus_decision_events table", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("CREATE TABLE consensus_decision_events");
  });

  it("has immutability triggers (no update, no delete)", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("consensus_decision_events_immutable");
    expect(sql).toContain("BEFORE UPDATE ON consensus_decision_events");
    expect(sql).toContain("BEFORE DELETE ON consensus_decision_events");
  });

  it("GRANT excludes UPDATE and DELETE (append-only)", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    const grantLines = sql.split("\n").filter(
      (l) => l.includes("GRANT") && l.includes("consensus_decision_events"),
    );
    for (const line of grantLines) {
      expect(line).not.toContain("UPDATE");
      expect(line).not.toContain("DELETE");
    }
  });

  it("RLS enabled and forced on consensus_decision_events", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("ALTER TABLE consensus_decision_events ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE consensus_decision_events FORCE  ROW LEVEL SECURITY");
    expect(sql).toContain("consensus_decision_events_tenant");
  });

  it("has review_task_id, approver_id, decision, decided_at columns", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("review_task_id");
    expect(sql).toContain("approver_id");
    expect(sql).toContain("decision");
    expect(sql).toContain("decided_at");
  });

  it("decision column is CHECK constrained to approved/rejected", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("CHECK (decision IN ('approved', 'rejected'))");
  });

  it("has a UNIQUE constraint on (review_task_id, approver_id)", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("UNIQUE (review_task_id, approver_id)");
  });

  it("migration registry entry present", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("INSERT INTO schema_migrations");
    expect(sql).toContain("014_consensus_decision_events");
  });
});

// ===========================================================================
// insertConsensusDecisionEvent (append-only — INSERT only)
// ===========================================================================

describe("insertConsensusDecisionEvent", () => {
  it("inserts a decision event row and returns it", async () => {
    const expected = makeEventRow();
    const { client } = makeMockClient([expected]);
    const result = await insertConsensusDecisionEvent(client, {
      tenantId:      TENANT_A,
      reviewTaskId:  REVIEW_TASK_ID,
      approverId:    APPROVER_ID,
      decision:      "approved",
      decidedAt:      NOW,
    });
    expect(result).toBe(expected);
  });

  it("only issues an INSERT (no UPDATE)", async () => {
    const { client, calls } = makeMockClient([makeEventRow()]);
    await insertConsensusDecisionEvent(client, {
      tenantId:      TENANT_A,
      reviewTaskId:  REVIEW_TASK_ID,
      approverId:    APPROVER_ID,
      decision:      "approved",
      decidedAt:      NOW,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain("INSERT INTO consensus_decision_events");
    expect(calls[0]?.text).not.toContain("UPDATE");
  });

  it("stores the decision as the 5th parameter", async () => {
    const { client, calls } = makeMockClient([makeEventRow()]);
    await insertConsensusDecisionEvent(client, {
      tenantId:      TENANT_A,
      reviewTaskId:  REVIEW_TASK_ID,
      approverId:    APPROVER_ID,
      decision:      "rejected",
      decidedAt:      NOW,
    });
    expect(calls[0]?.values[4]).toBe("rejected");
  });
});

// ===========================================================================
// listConsensusDecisionEventsByTask
// ===========================================================================

describe("listConsensusDecisionEventsByTask", () => {
  it("returns all events for a review task", async () => {
    const rows = [
      makeEventRow(),
      makeEventRow({ approver_id: "dddddddd-0000-4000-d000-000000000004", decision: "rejected" }),
    ];
    const { client } = makeMockClient(rows);
    const result = await listConsensusDecisionEventsByTask(client, REVIEW_TASK_ID);
    expect(result).toHaveLength(2);
  });

  it("queries by review_task_id ordered by decided_at ASC", async () => {
    const { client, calls } = makeMockClient([]);
    await listConsensusDecisionEventsByTask(client, REVIEW_TASK_ID);
    expect(calls[0]?.text).toContain("WHERE review_task_id = $1");
    expect(calls[0]?.text).toContain("ORDER BY decided_at ASC");
    expect(calls[0]?.values[0]).toBe(REVIEW_TASK_ID);
  });

  it("returns empty array when no events", async () => {
    const { client } = makeMockClient([]);
    const result = await listConsensusDecisionEventsByTask(client, REVIEW_TASK_ID);
    expect(result).toHaveLength(0);
  });
});

// ===========================================================================
// countConsensusApprovals
// ===========================================================================

describe("countConsensusApprovals", () => {
  it("returns the count of approved events", async () => {
    const { client } = makeMockClient([{ count: "2" }]);
    const result = await countConsensusApprovals(client, REVIEW_TASK_ID);
    expect(result).toBe(2);
  });

  it("returns 0 when no approvals", async () => {
    const { client } = makeMockClient([{ count: "0" }]);
    const result = await countConsensusApprovals(client, REVIEW_TASK_ID);
    expect(result).toBe(0);
  });

  it("queries by review_task_id and decision = approved", async () => {
    const { client, calls } = makeMockClient([{ count: "0" }]);
    await countConsensusApprovals(client, REVIEW_TASK_ID);
    expect(calls[0]?.text).toContain("review_task_id = $1");
    expect(calls[0]?.text).toContain("decision = 'approved'");
    expect(calls[0]?.values[0]).toBe(REVIEW_TASK_ID);
  });
});

// ===========================================================================
// countConsensusRejections
// ===========================================================================

describe("countConsensusRejections", () => {
  it("returns the count of rejected events", async () => {
    const { client } = makeMockClient([{ count: "1" }]);
    const result = await countConsensusRejections(client, REVIEW_TASK_ID);
    expect(result).toBe(1);
  });

  it("queries by review_task_id and decision = rejected", async () => {
    const { client, calls } = makeMockClient([{ count: "0" }]);
    await countConsensusRejections(client, REVIEW_TASK_ID);
    expect(calls[0]?.text).toContain("review_task_id = $1");
    expect(calls[0]?.text).toContain("decision = 'rejected'");
    expect(calls[0]?.values[0]).toBe(REVIEW_TASK_ID);
  });
});

// ===========================================================================
// Tenant isolation contract
// ===========================================================================

describe("tenant isolation — DB layer contract", () => {
  it("insertConsensusDecisionEvent passes tenant_id as the second parameter", async () => {
    const { client, calls } = makeMockClient([makeEventRow()]);
    await insertConsensusDecisionEvent(client, {
      tenantId:      TENANT_A,
      reviewTaskId:  REVIEW_TASK_ID,
      approverId:    APPROVER_ID,
      decision:      "approved",
      decidedAt:      NOW,
    });
    expect(calls[0]?.values[1]).toBe(TENANT_A);
  });
});
