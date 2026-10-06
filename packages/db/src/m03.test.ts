/**
 * Unit tests for packages/db/src/m03.ts — M03 plans and drafts DB layer.
 *
 * Uses a mock pg client (no live database required).
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, vi } from "vitest";
import { insertM03Plan, getM03Plan, insertM03Draft, getM03Draft } from "./m03.js";
import type { DbClient } from "./client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUuid() {
  return "00000000-0000-4000-8000-" + Math.random().toString(16).slice(2, 14).padEnd(12, "0");
}

function makeMockClient(rows: unknown[]): DbClient {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as DbClient;
}

const BASE_PLAN_PARAMS = {
  tenantId:          makeUuid(),
  projectId:         makeUuid(),
  workflowRunId:     makeUuid(),
  agentVersionId:    makeUuid(),
  promptVersionId:   makeUuid(),
  schemaVersionId:   makeUuid(),
  policyVersionId:   makeUuid(),
  sourceVersionIds:  [makeUuid()],
  inputHash:         "a".repeat(64),
  contentJson:       { sections: [] } as Record<string, unknown>,
  planHash:          "b".repeat(64),
};

const BASE_DRAFT_PARAMS = {
  tenantId:          makeUuid(),
  projectId:         makeUuid(),
  workflowRunId:     makeUuid(),
  planId:            makeUuid(),
  agentVersionId:    makeUuid(),
  promptVersionId:   makeUuid(),
  schemaVersionId:   makeUuid(),
  policyVersionId:   makeUuid(),
  claimIds:          [makeUuid()],
  contentJson:       { metadata: {} } as Record<string, unknown>,
  draftHash:         "c".repeat(64),
};

// ---------------------------------------------------------------------------
// insertM03Plan
// ---------------------------------------------------------------------------

describe("insertM03Plan", () => {
  it("inserts a plan and returns the row", async () => {
    const expected = { id: makeUuid(), ...BASE_PLAN_PARAMS, created_at: new Date() };
    const client = makeMockClient([expected]);
    const result = await insertM03Plan(client, BASE_PLAN_PARAMS);
    expect(result).toBe(expected);
  });

  it("calls INSERT with all 12 parameters", async () => {
    const client = makeMockClient([{ id: makeUuid() }]);
    await insertM03Plan(client, BASE_PLAN_PARAMS);
    const [sql, args] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO m03_plans");
    expect(args).toHaveLength(12);
  });

  it("uses ON CONFLICT DO NOTHING for idempotency", async () => {
    const client = makeMockClient([{ id: makeUuid() }]);
    await insertM03Plan(client, BASE_PLAN_PARAMS);
    const [sql] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("ON CONFLICT (workflow_run_id) DO NOTHING");
  });

  it("falls back to getM03Plan when ON CONFLICT fires (returns empty rows)", async () => {
    const existingRow = { id: makeUuid(), workflow_run_id: BASE_PLAN_PARAMS.workflowRunId };
    // First call: INSERT returns 0 rows (conflict). Second call: SELECT returns existing.
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingRow] }),
    } as unknown as DbClient;
    const result = await insertM03Plan(client, BASE_PLAN_PARAMS);
    expect(result).toBe(existingRow);
    expect((client.query as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it("passes sourceVersionIds as array parameter", async () => {
    const ids = [makeUuid(), makeUuid()];
    const client = makeMockClient([{ id: makeUuid() }]);
    await insertM03Plan(client, { ...BASE_PLAN_PARAMS, sourceVersionIds: ids });
    const [, args] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(args[8]).toEqual(ids);
  });

  it("serialises contentJson to a JSON string", async () => {
    const client = makeMockClient([{ id: makeUuid() }]);
    await insertM03Plan(client, BASE_PLAN_PARAMS);
    const [, args] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(typeof args[10]).toBe("string");
    expect(() => JSON.parse(args[10] as string)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getM03Plan
// ---------------------------------------------------------------------------

describe("getM03Plan", () => {
  it("returns the plan row when found", async () => {
    const row = { id: makeUuid() };
    const client = makeMockClient([row]);
    const result = await getM03Plan(client, makeUuid());
    expect(result).toBe(row);
  });

  it("throws when no row is found", async () => {
    const client = makeMockClient([]);
    await expect(getM03Plan(client, makeUuid())).rejects.toThrow("M03 plan not found");
  });

  it("queries by workflow_run_id", async () => {
    const wfRunId = makeUuid();
    const client = makeMockClient([{ id: makeUuid() }]);
    await getM03Plan(client, wfRunId);
    const [sql, args] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("workflow_run_id = $1");
    expect(args[0]).toBe(wfRunId);
  });
});

// ---------------------------------------------------------------------------
// insertM03Draft
// ---------------------------------------------------------------------------

describe("insertM03Draft", () => {
  it("inserts a draft and returns the row", async () => {
    const expected = { id: makeUuid(), ...BASE_DRAFT_PARAMS };
    const client = makeMockClient([expected]);
    const result = await insertM03Draft(client, BASE_DRAFT_PARAMS);
    expect(result).toBe(expected);
  });

  it("calls INSERT with all 12 parameters", async () => {
    const client = makeMockClient([{ id: makeUuid() }]);
    await insertM03Draft(client, BASE_DRAFT_PARAMS);
    const [sql, args] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO m03_drafts");
    expect(args).toHaveLength(12);
  });

  it("uses ON CONFLICT DO NOTHING for idempotency", async () => {
    const client = makeMockClient([{ id: makeUuid() }]);
    await insertM03Draft(client, BASE_DRAFT_PARAMS);
    const [sql] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("ON CONFLICT (workflow_run_id) DO NOTHING");
  });

  it("falls back to getM03Draft on conflict", async () => {
    const existingRow = { id: makeUuid(), workflow_run_id: BASE_DRAFT_PARAMS.workflowRunId };
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingRow] }),
    } as unknown as DbClient;
    const result = await insertM03Draft(client, BASE_DRAFT_PARAMS);
    expect(result).toBe(existingRow);
  });

  it("passes claimIds as array parameter", async () => {
    const ids = [makeUuid(), makeUuid(), makeUuid()];
    const client = makeMockClient([{ id: makeUuid() }]);
    await insertM03Draft(client, { ...BASE_DRAFT_PARAMS, claimIds: ids });
    const [, args] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(args[9]).toEqual(ids);
  });
});

// ---------------------------------------------------------------------------
// getM03Draft
// ---------------------------------------------------------------------------

describe("getM03Draft", () => {
  it("returns the draft row when found", async () => {
    const row = { id: makeUuid() };
    const client = makeMockClient([row]);
    const result = await getM03Draft(client, makeUuid());
    expect(result).toBe(row);
  });

  it("throws when no row is found", async () => {
    const client = makeMockClient([]);
    await expect(getM03Draft(client, makeUuid())).rejects.toThrow("M03 draft not found");
  });

  it("queries by workflow_run_id", async () => {
    const wfRunId = makeUuid();
    const client = makeMockClient([{ id: makeUuid() }]);
    await getM03Draft(client, wfRunId);
    const [, args] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(args[0]).toBe(wfRunId);
  });
});

// ---------------------------------------------------------------------------
// Migration SQL structure
// ---------------------------------------------------------------------------

describe("migration 005 SQL", () => {
  it("file exists and contains m03_plans table", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      new URL("../../migrations/005_m03_architect.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE m03_plans");
  });

  it("contains m03_drafts table", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      new URL("../../migrations/005_m03_architect.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE m03_drafts");
  });

  it("enables RLS on both tables", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      new URL("../../migrations/005_m03_architect.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("ALTER TABLE m03_plans  ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE m03_drafts ENABLE ROW LEVEL SECURITY");
  });

  it("grants only SELECT, INSERT (immutable tables)", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      new URL("../../migrations/005_m03_architect.sql", import.meta.url),
      "utf8",
    );
    // Must not grant UPDATE or DELETE on either table.
    const lines = sql.split("\n").filter(l => l.includes("GRANT") && (l.includes("m03_plans") || l.includes("m03_drafts")));
    for (const line of lines) {
      expect(line).not.toContain("UPDATE");
      expect(line).not.toContain("DELETE");
    }
  });

  it("registers migration in schema_migrations", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      new URL("../../migrations/005_m03_architect.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("INSERT INTO schema_migrations (name) VALUES ('005_m03_architect')");
  });
});
