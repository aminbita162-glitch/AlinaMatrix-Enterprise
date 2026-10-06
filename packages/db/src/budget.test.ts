/**
 * Unit tests for packages/db/src/budget.ts — project budgets (Phase 9 Unit 3).
 *
 * Uses a mock pg client (no live database required).
 * Also inspects migration 010 SQL for structural correctness.
 *
 * Covers:
 *   - insertProjectBudget inserts and returns the row; ON CONFLICT DO NOTHING.
 *   - getProjectBudget returns the row or throws.
 *   - increaseProjectBudgetSpent issues an UPDATE with the amount.
 *   - Migration 010 SQL: table, RLS, GRANT, non-negative checks, registry.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  insertProjectBudget,
  getProjectBudget,
  increaseProjectBudgetSpent,
} from "./budget.js";
import type { ProjectBudgetRow } from "./budget.js";
import type { DbClient } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(__dirname, "../migrations/010_project_budgets.sql");

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

const TENANT_A   = "aaaaaaaa-0000-4000-a000-000000000001";
const PROJECT_ID = "cccccccc-0000-4000-c000-000000000001";
const NOW = new Date("2026-10-06T12:00:00.000Z");

function makeBudgetRow(overrides: Partial<ProjectBudgetRow> = {}): ProjectBudgetRow {
  return {
    id:                  "11111111-0000-4000-b000-000000000001",
    tenant_id:           TENANT_A,
    project_id:          PROJECT_ID,
    budget_minor_units:  10000n,
    spent_minor_units:   0n,
    created_at:          NOW,
    updated_at:          NOW,
    ...overrides,
  };
}

// ===========================================================================
// Migration 010 SQL structural tests
// ===========================================================================

describe("migration 010 SQL structural checks", () => {
  let sql = "";

  it("migration file can be read", async () => {
    sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql.length).toBeGreaterThan(200);
  });

  it("creates project_budgets table", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("CREATE TABLE project_budgets");
  });

  it("uses bigint columns for minor-unit amounts", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("budget_minor_units   bigint");
    expect(sql).toContain("spent_minor_units    bigint");
  });

  it("has non-negative CHECK constraints", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("budget_non_negative");
    expect(sql).toContain("spent_non_negative");
    expect(sql).toContain(">= 0");
  });

  it("has UNIQUE constraint on (tenant_id, project_id)", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("UNIQUE (tenant_id, project_id)");
  });

  it("RLS enabled and forced on project_budgets", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("ALTER TABLE project_budgets ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE project_budgets FORCE  ROW LEVEL SECURITY");
    expect(sql).toContain("project_budgets_tenant");
  });

  it("GRANT includes SELECT, INSERT, UPDATE (no DELETE)", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE ON project_budgets TO app_user");
    const grantLines = sql.split("\n").filter(
      (l) => l.includes("GRANT") && l.includes("project_budgets"),
    );
    for (const line of grantLines) {
      expect(line).not.toContain("DELETE");
    }
  });

  it("migration registry entry present", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("INSERT INTO schema_migrations");
    expect(sql).toContain("010_project_budgets");
  });
});

// ===========================================================================
// insertProjectBudget
// ===========================================================================

describe("insertProjectBudget", () => {
  it("inserts a budget row and returns it", async () => {
    const expected = makeBudgetRow();
    const { client } = makeMockClient([expected]);
    const result = await insertProjectBudget(client, {
      tenantId: TENANT_A,
      projectId: PROJECT_ID,
      budgetMinorUnits: 10000n,
    });
    expect(result).toBe(expected);
  });

  it("uses ON CONFLICT DO NOTHING for idempotency", async () => {
    const { client, calls } = makeMockClient([makeBudgetRow()]);
    await insertProjectBudget(client, {
      tenantId: TENANT_A,
      projectId: PROJECT_ID,
      budgetMinorUnits: 10000n,
    });
    expect(calls[0]?.text).toContain("ON CONFLICT (tenant_id, project_id) DO NOTHING");
  });

  it("passes bigint as string for pg compatibility", async () => {
    const { client, calls } = makeMockClient([makeBudgetRow()]);
    await insertProjectBudget(client, {
      tenantId: TENANT_A,
      projectId: PROJECT_ID,
      budgetMinorUnits: 10000n,
    });
    expect(calls[0]?.values[3]).toBe("10000");
  });

  it("defaults spent to 0n when not provided", async () => {
    const { client, calls } = makeMockClient([makeBudgetRow()]);
    await insertProjectBudget(client, {
      tenantId: TENANT_A,
      projectId: PROJECT_ID,
      budgetMinorUnits: 10000n,
    });
    expect(calls[0]?.values[4]).toBe("0");
  });

  it("falls back to getProjectBudget when ON CONFLICT fires", async () => {
    const existing = makeBudgetRow();
    let callCount = 0;
    const client = {
      query: vi.fn(async () => {
        callCount++;
        return callCount === 1 ? { rows: [] } : { rows: [existing] };
      }),
    } as unknown as DbClient;
    const result = await insertProjectBudget(client, {
      tenantId: TENANT_A,
      projectId: PROJECT_ID,
      budgetMinorUnits: 10000n,
    });
    expect(result).toBe(existing);
    expect(callCount).toBe(2);
  });
});

// ===========================================================================
// getProjectBudget
// ===========================================================================

describe("getProjectBudget", () => {
  it("returns the row when found", async () => {
    const expected = makeBudgetRow();
    const { client } = makeMockClient([expected]);
    const result = await getProjectBudget(client, TENANT_A, PROJECT_ID);
    expect(result).toBe(expected);
  });

  it("throws when no row is found", async () => {
    const { client } = makeMockClient([]);
    await expect(getProjectBudget(client, TENANT_A, PROJECT_ID)).rejects.toThrow(
      "Project budget not found",
    );
  });
});

// ===========================================================================
// increaseProjectBudgetSpent
// ===========================================================================

describe("increaseProjectBudgetSpent", () => {
  it("issues an UPDATE adding the amount to spent_minor_units", async () => {
    const expected = makeBudgetRow({ spent_minor_units: 1500n });
    const { client, calls } = makeMockClient([expected]);
    const result = await increaseProjectBudgetSpent(client, {
      tenantId: TENANT_A,
      projectId: PROJECT_ID,
      amount: 1500n,
    });
    expect(result).toBe(expected);
    expect(calls[0]?.text).toContain("spent_minor_units = spent_minor_units + $3");
  });

  it("passes the amount as a string for pg bigint compatibility", async () => {
    const { client, calls } = makeMockClient([makeBudgetRow()]);
    await increaseProjectBudgetSpent(client, {
      tenantId: TENANT_A,
      projectId: PROJECT_ID,
      amount: 2500n,
    });
    expect(calls[0]?.values[2]).toBe("2500");
  });

  it("throws when the budget row is not found", async () => {
    const { client } = makeMockClient([]);
    await expect(increaseProjectBudgetSpent(client, {
      tenantId: TENANT_A,
      projectId: PROJECT_ID,
      amount: 100n,
    })).rejects.toThrow("Project budget not found");
  });
});

// ===========================================================================
// Tenant isolation contract
// ===========================================================================

describe("tenant isolation — DB layer contract", () => {
  it("insertProjectBudget passes tenant_id as the second parameter", async () => {
    const { client, calls } = makeMockClient([makeBudgetRow()]);
    await insertProjectBudget(client, {
      tenantId: TENANT_A,
      projectId: PROJECT_ID,
      budgetMinorUnits: 10000n,
    });
    expect(calls[0]?.values[1]).toBe(TENANT_A);
  });

  it("getProjectBudget filters by tenant_id and project_id", async () => {
    const { client, calls } = makeMockClient([]);
    try {
      await getProjectBudget(client, TENANT_A, PROJECT_ID);
    } catch {
      // expected — no row
    }
    expect(calls[0]?.text).toContain("tenant_id = $1");
    expect(calls[0]?.text).toContain("project_id = $2");
  });
});
