/**
 * Unit tests for packages/db/src/agents.ts
 *
 * Uses a mock PoolClient — no live database required.
 * Tests: insertJob deduplication, transitionJobState legal/illegal,
 * appendJobEvent, getOrInsertCacheEntry hit/miss, insertUsageEvent.
 * Also verifies migration SQL contains required RLS and seed.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  insertJob,
  getJob,
  transitionJobState,
  appendJobEvent,
  listJobEvents,
  getOrInsertCacheEntry,
  insertUsageEvent,
  listUsageEventsByProject,
  insertWorkflow,
  insertWorkflowRun,
  listAgents,
} from "../src/agents.js";
import type {
  ProcessingJobRow,
  JobEventRow,
  CacheEntryRow,
  UsageEventRow,
  WorkflowRow,
  WorkflowRunRow,
  AgentRow,
} from "../src/agents.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(__dirname, "../migrations/004_jobs_agents.sql");

// ============================================================
// Mock client
// ============================================================

interface MockQuery { text: string; values: unknown[] }
interface MockResult { rows: unknown[]; rowCount: number }

function makeMockClient(
  rowFactory?: (text: string, values: unknown[]) => unknown[],
): { client: Parameters<typeof insertJob>[0]; queries: MockQuery[] } {
  const queries: MockQuery[] = [];
  const client = {
    query: async (text: string, values?: unknown[]): Promise<MockResult> => {
      const vals = values ?? [];
      queries.push({ text, values: vals });
      const rows = rowFactory ? rowFactory(text, vals) : [];
      return { rows, rowCount: rows.length };
    },
  } as unknown as Parameters<typeof insertJob>[0];
  return { client, queries };
}

// ============================================================
// Fixture data
// ============================================================

const TENANT_A  = "aaaaaaaa-0000-4000-a000-000000000001";
const PROJECT_ID = "cccccccc-0000-4000-c000-000000000001";
const WF_RUN_ID = "dddddddd-0000-4000-d000-000000000001";
const JOB_ID    = "eeeeeeee-0000-4000-e000-000000000001";
const AGENT_VID = "ffffffff-0000-4000-f000-000000000001";
const MODEL_VID = "11111111-0000-4000-a000-000000000001";
const RUN_ID    = "22222222-0000-4000-a000-000000000001";

function makeJobRow(overrides: Partial<ProcessingJobRow> = {}): ProcessingJobRow {
  return {
    id:               JOB_ID,
    tenant_id:        TENANT_A,
    workflow_run_id:  WF_RUN_ID,
    agent_version_id: null,
    idempotency_key:  "key-1",
    state:            "INGESTED",
    created_at:       new Date(),
    updated_at:       new Date(),
    ...overrides,
  };
}

function makeJobEventRow(): JobEventRow {
  return {
    id:         "ev-1",
    tenant_id:  TENANT_A,
    job_id:     JOB_ID,
    from_state: "INGESTED",
    to_state:   "CLASSIFIED",
    reason:     null,
    created_at: new Date(),
  };
}

function makeCacheRow(cacheKey: string, tenantId: string): CacheEntryRow {
  return {
    id:                "ce-1",
    tenant_id:         tenantId,
    cache_key:         cacheKey,
    output_json:       { result: "fake" },
    prompt_version_id: "pv-1",
    model_version_id:  MODEL_VID,
    schema_version_id: "sv-1",
    policy_version_id: "polv-1",
    created_at:        new Date(),
  };
}

function makeUsageRow(): UsageEventRow {
  return {
    id:                "ue-1",
    tenant_id:         TENANT_A,
    project_id:        PROJECT_ID,
    agent_run_id:      RUN_ID,
    agent_version_id:  AGENT_VID,
    model_version_id:  MODEL_VID,
    prompt_tokens:     100,
    completion_tokens: 50,
    total_tokens:      150,
    cost_minor_units:  "500",
    created_at:        new Date(),
  };
}

// ============================================================
// insertJob — idempotency
// ============================================================

describe("insertJob", () => {
  it("inserts a new job when idempotency key is not found", async () => {
    const row = makeJobRow();
    const { client, queries } = makeMockClient((text) => {
      if (text.includes("SELECT * FROM processing_jobs")) return [];
      return [row];
    });

    const result = await insertJob(client, {
      tenantId:       TENANT_A,
      workflowRunId:  WF_RUN_ID,
      idempotencyKey: "key-1",
    });

    expect(result.deduplicated).toBe(false);
    expect(result.row.id).toBe(JOB_ID);
    // Should have issued a SELECT check then an INSERT
    expect(queries.some(q => q.text.includes("SELECT") && q.text.includes("processing_jobs"))).toBe(true);
    expect(queries.some(q => q.text.includes("INSERT"))).toBe(true);
  });

  it("returns existing row without inserting when idempotency key exists", async () => {
    const row = makeJobRow();
    const { client, queries } = makeMockClient((text) => {
      // Always return a row from the SELECT — simulates existing key
      if (text.includes("SELECT * FROM processing_jobs")) return [row];
      return [];
    });

    const result = await insertJob(client, {
      tenantId:       TENANT_A,
      workflowRunId:  WF_RUN_ID,
      idempotencyKey: "key-1",
    });

    expect(result.deduplicated).toBe(true);
    expect(result.row.id).toBe(JOB_ID);
    // Should have issued only the SELECT — no INSERT
    expect(queries.every(q => !q.text.includes("INSERT"))).toBe(true);
  });

  it("carries tenant_id in the INSERT query", async () => {
    const row = makeJobRow();
    const { client, queries } = makeMockClient((text) => {
      if (text.includes("SELECT * FROM processing_jobs")) return [];
      return [row];
    });

    await insertJob(client, {
      tenantId:       TENANT_A,
      workflowRunId:  WF_RUN_ID,
      idempotencyKey: "key-1",
    });

    const insertQuery = queries.find(q => q.text.includes("INSERT"))!;
    expect(insertQuery.values).toContain(TENANT_A);
  });
});

// ============================================================
// getJob
// ============================================================

describe("getJob", () => {
  it("returns null when job not found", async () => {
    const { client } = makeMockClient(() => []);
    const result = await getJob(client, JOB_ID);
    expect(result).toBeNull();
  });

  it("returns job row when found", async () => {
    const row = makeJobRow();
    const { client } = makeMockClient(() => [row]);
    const result = await getJob(client, JOB_ID);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(JOB_ID);
  });
});

// ============================================================
// transitionJobState
// ============================================================

describe("transitionJobState", () => {
  it("issues UPDATE and INSERT when transition is legal", async () => {
    const { client, queries } = makeMockClient(() => []);

    await transitionJobState(client, JOB_ID, TENANT_A, "INGESTED", "CLASSIFIED");

    expect(queries.some(q => q.text.includes("UPDATE processing_jobs"))).toBe(true);
    expect(queries.some(q => q.text.includes("INSERT INTO job_events"))).toBe(true);
  });

  it("throws IllegalTransitionError for illegal jumps (INGESTED -> RELEASED)", async () => {
    const { client } = makeMockClient(() => []);

    await expect(
      transitionJobState(client, JOB_ID, TENANT_A, "INGESTED", "RELEASED"),
    ).rejects.toThrow(/Illegal workflow transition/);
  });

  it("throws for CANCELLED -> GENERATED (terminal state)", async () => {
    const { client } = makeMockClient(() => []);

    await expect(
      transitionJobState(client, JOB_ID, TENANT_A, "CANCELLED", "GENERATED"),
    ).rejects.toThrow(/Illegal workflow transition/);
  });

  it("throws for RELEASED -> INGESTED", async () => {
    const { client } = makeMockClient(() => []);

    await expect(
      transitionJobState(client, JOB_ID, TENANT_A, "RELEASED", "INGESTED"),
    ).rejects.toThrow(/Illegal workflow transition/);
  });

  it("includes reason in job_event insert when provided", async () => {
    const { client, queries } = makeMockClient(() => []);

    await transitionJobState(client, JOB_ID, TENANT_A, "INGESTED", "CLASSIFIED", "test reason");

    const insertQ = queries.find(q => q.text.includes("INSERT INTO job_events"))!;
    expect(insertQ.values).toContain("test reason");
  });

  it("passes tenant_id in job_event INSERT", async () => {
    const { client, queries } = makeMockClient(() => []);

    await transitionJobState(client, JOB_ID, TENANT_A, "INGESTED", "CLASSIFIED");

    const insertQ = queries.find(q => q.text.includes("INSERT INTO job_events"))!;
    expect(insertQ.values).toContain(TENANT_A);
  });
});

// ============================================================
// appendJobEvent
// ============================================================

describe("appendJobEvent", () => {
  it("inserts a job_event row and returns it", async () => {
    const row = makeJobEventRow();
    const { client, queries } = makeMockClient(() => [row]);

    const result = await appendJobEvent(client, {
      tenantId:  TENANT_A,
      jobId:     JOB_ID,
      fromState: "INGESTED",
      toState:   "CLASSIFIED",
    });

    expect(result.from_state).toBe("INGESTED");
    expect(result.to_state).toBe("CLASSIFIED");
    expect(queries.some(q => q.text.includes("INSERT INTO job_events"))).toBe(true);
  });
});

describe("listJobEvents", () => {
  it("returns ordered events from DB", async () => {
    const ev1 = makeJobEventRow();
    const ev2 = { ...makeJobEventRow(), id: "ev-2", from_state: "CLASSIFIED", to_state: "EXTRACTED" } as JobEventRow;
    const { client } = makeMockClient(() => [ev1, ev2]);

    const result = await listJobEvents(client, JOB_ID);
    expect(result).toHaveLength(2);
    expect(result[0]!.from_state).toBe("INGESTED");
    expect(result[1]!.from_state).toBe("CLASSIFIED");
  });

  it("returns empty array when no events", async () => {
    const { client } = makeMockClient(() => []);
    const result = await listJobEvents(client, JOB_ID);
    expect(result).toEqual([]);
  });
});

// ============================================================
// getOrInsertCacheEntry — hit and miss
// ============================================================

describe("getOrInsertCacheEntry", () => {
  const CACHE_KEY = "a".repeat(64);

  it("returns hit=true when cache entry exists", async () => {
    const row = makeCacheRow(CACHE_KEY, TENANT_A);
    const { client } = makeMockClient(() => [row]);

    const result = await getOrInsertCacheEntry(client, {
      tenantId:         TENANT_A,
      cacheKey:         CACHE_KEY,
      outputJson:       { result: "fake" },
      promptVersionId:  "pv-1",
      modelVersionId:   MODEL_VID,
      schemaVersionId:  "sv-1",
      policyVersionId:  "polv-1",
    });

    expect(result.hit).toBe(true);
    expect(result.row.cache_key).toBe(CACHE_KEY);
  });

  it("returns hit=false and inserts when cache entry does not exist", async () => {
    const row = makeCacheRow(CACHE_KEY, TENANT_A);
    let selectCalled = false;
    const { client, queries } = makeMockClient((text) => {
      if (text.includes("SELECT * FROM cache_entries")) {
        if (!selectCalled) {
          selectCalled = true;
          return [];
        }
        return [row];
      }
      // INSERT returns the new row
      return [row];
    });

    const result = await getOrInsertCacheEntry(client, {
      tenantId:         TENANT_A,
      cacheKey:         CACHE_KEY,
      outputJson:       { result: "fake" },
      promptVersionId:  "pv-1",
      modelVersionId:   MODEL_VID,
      schemaVersionId:  "sv-1",
      policyVersionId:  "polv-1",
    });

    expect(result.hit).toBe(false);
    expect(queries.some(q => q.text.includes("INSERT INTO cache_entries"))).toBe(true);
  });

  it("INSERT carries tenant_id (cross-tenant isolation)", async () => {
    const row = makeCacheRow(CACHE_KEY, TENANT_A);
    const { client, queries } = makeMockClient((text) => {
      if (text.includes("SELECT")) return [];
      return [row];
    });

    await getOrInsertCacheEntry(client, {
      tenantId:         TENANT_A,
      cacheKey:         CACHE_KEY,
      outputJson:       { result: "fake" },
      promptVersionId:  "pv-1",
      modelVersionId:   MODEL_VID,
      schemaVersionId:  "sv-1",
      policyVersionId:  "polv-1",
    });

    const insertQ = queries.find(q => q.text.includes("INSERT INTO cache_entries"))!;
    expect(insertQ.values).toContain(TENANT_A);
  });
});

// ============================================================
// insertUsageEvent
// ============================================================

describe("insertUsageEvent", () => {
  it("inserts and returns a usage event row", async () => {
    const row = makeUsageRow();
    const { client, queries } = makeMockClient(() => [row]);

    const result = await insertUsageEvent(client, {
      tenantId:         TENANT_A,
      projectId:        PROJECT_ID,
      agentRunId:       RUN_ID,
      agentVersionId:   AGENT_VID,
      modelVersionId:   MODEL_VID,
      promptTokens:     100,
      completionTokens: 50,
      costMinorUnits:   500,
    });

    expect(result.prompt_tokens).toBe(100);
    expect(result.completion_tokens).toBe(50);
    expect(queries.some(q => q.text.includes("INSERT INTO usage_events"))).toBe(true);
  });

  it("carries tenant_id and project_id in INSERT", async () => {
    const row = makeUsageRow();
    const { client, queries } = makeMockClient(() => [row]);

    await insertUsageEvent(client, {
      tenantId:         TENANT_A,
      projectId:        PROJECT_ID,
      agentRunId:       RUN_ID,
      agentVersionId:   AGENT_VID,
      modelVersionId:   MODEL_VID,
      promptTokens:     100,
      completionTokens: 50,
      costMinorUnits:   500,
    });

    const insertQ = queries.find(q => q.text.includes("INSERT INTO usage_events"))!;
    expect(insertQ.values).toContain(TENANT_A);
    expect(insertQ.values).toContain(PROJECT_ID);
  });
});

describe("listUsageEventsByProject", () => {
  it("returns rows from DB", async () => {
    const row = makeUsageRow();
    const { client } = makeMockClient(() => [row]);
    const result = await listUsageEventsByProject(client, PROJECT_ID);
    expect(result).toHaveLength(1);
    expect(result[0]!.project_id).toBe(PROJECT_ID);
  });

  it("returns empty array when none found", async () => {
    const { client } = makeMockClient(() => []);
    const result = await listUsageEventsByProject(client, PROJECT_ID);
    expect(result).toEqual([]);
  });
});

// ============================================================
// insertWorkflow / insertWorkflowRun (query shape tests)
// ============================================================

describe("insertWorkflow", () => {
  it("carries tenant_id in INSERT", async () => {
    const row: WorkflowRow = {
      id: "wf-1", tenant_id: TENANT_A, project_id: PROJECT_ID,
      name: "test", description: null, created_at: new Date(), updated_at: new Date(),
    };
    const { client, queries } = makeMockClient(() => [row]);

    await insertWorkflow(client, {
      tenantId:  TENANT_A,
      projectId: PROJECT_ID,
      name:      "test",
    });

    const q = queries.find(q => q.text.includes("INSERT INTO workflows"))!;
    expect(q.values).toContain(TENANT_A);
  });
});

describe("insertWorkflowRun", () => {
  it("carries tenant_id in INSERT", async () => {
    const row: WorkflowRunRow = {
      id: "wr-1", tenant_id: TENANT_A, workflow_id: "wf-1",
      state: "INGESTED", created_at: new Date(), updated_at: new Date(),
    };
    const { client, queries } = makeMockClient(() => [row]);

    await insertWorkflowRun(client, { tenantId: TENANT_A, workflowId: "wf-1" });

    const q = queries.find(q => q.text.includes("INSERT INTO workflow_runs"))!;
    expect(q.values).toContain(TENANT_A);
  });
});

describe("listAgents", () => {
  it("returns agent rows", async () => {
    const row: AgentRow = {
      id: "ag-1", name: "AlinaArchitect",
      capabilities: ["READ_SOURCE", "READ_EVIDENCE", "WRITE_DRAFT"],
      description: null, created_at: new Date(), updated_at: new Date(),
    };
    const { client } = makeMockClient(() => [row]);
    const result = await listAgents(client);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("AlinaArchitect");
  });
});

// ============================================================
// Migration SQL inspection (no live DB needed)
// ============================================================

describe("migration 004_jobs_agents.sql", () => {
  it("contains CREATE TABLE processing_jobs", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("CREATE TABLE processing_jobs");
  });

  it("contains CREATE TABLE job_events", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("CREATE TABLE job_events");
  });

  it("contains CREATE TABLE usage_events", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("CREATE TABLE usage_events");
  });

  it("contains CREATE TABLE cache_entries", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("CREATE TABLE cache_entries");
  });

  it("contains CREATE TABLE agents", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("CREATE TABLE agents");
  });

  it("contains CREATE TABLE agent_versions", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("CREATE TABLE agent_versions");
  });

  it("contains CREATE TABLE workflows", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("CREATE TABLE workflows");
  });

  it("contains CREATE TABLE workflow_runs", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("CREATE TABLE workflow_runs");
  });

  it("contains RLS ENABLE on all tenant-scoped tables", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("ALTER TABLE workflows       ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE job_events      ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE usage_events    ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE cache_entries   ENABLE ROW LEVEL SECURITY");
  });

  it("cache_key UNIQUE constraint prevents cross-tenant collisions at DB level", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("cache_key           text        NOT NULL UNIQUE");
  });

  it("contains idempotency_key UNIQUE constraint on processing_jobs", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("UNIQUE (workflow_run_id, idempotency_key)");
  });

  it("seeds exactly four agents", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("AlinaArchitect");
    expect(sql).toContain("AlinaGuard");
    expect(sql).toContain("AlinaDocEngine");
    expect(sql).toContain("AlinaOptimizer");
  });

  it("agent seed includes capability arrays matching directive", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("READ_SOURCE");
    expect(sql).toContain("READ_EVIDENCE");
    expect(sql).toContain("WRITE_DRAFT");
    expect(sql).toContain("RUN_VALIDATION");
    expect(sql).toContain("COMPILE_ARTIFACT");
    expect(sql).toContain("READ_USAGE");
    expect(sql).toContain("WRITE_CACHE_METADATA");
  });

  it("contains job_events append-only rules", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("job_events_no_update");
    expect(sql).toContain("job_events_no_delete");
  });
});
