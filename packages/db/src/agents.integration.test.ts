/**
 * Live PostgreSQL integration tests for Phase 5 tables:
 * agents, workflows, workflow_runs, processing_jobs, job_events,
 * agent_runs, usage_events, cache_entries.
 *
 * Requires a running PostgreSQL with migrations 001–004 applied
 * and the fixture seed loaded.
 *
 * Skipped automatically when DATABASE_URL is not set.
 *
 * Run:
 *   DATABASE_URL=postgres://app_user:app_user_dev@localhost:5432/alinamatrix \
 *   SUPERUSER_URL=postgres://alinamatrix:alinamatrix_dev@localhost:5432/alinamatrix \
 *     pnpm exec vitest run src/agents.integration.test.ts
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPool, withTransaction, setTenantContext } from "../src/index.js";
import {
  insertWorkflow,
  getWorkflow,
  insertWorkflowRun,
  getWorkflowRun,
  insertJob,
  getJob,
  transitionJobState,
  appendJobEvent,
  listJobEvents,
  insertAgentRun,
  completeAgentRun,
  getAgentRun,
  insertUsageEvent,
  listUsageEventsByProject,
  getOrInsertCacheEntry,
  getCacheEntry,
} from "../src/agents.js";
import type { DbPool } from "../src/index.js";
import type pg from "pg";

const DATABASE_URL = process.env["DATABASE_URL"];
const SUPERUSER_URL =
  process.env["SUPERUSER_URL"] ??
  "postgres://alinamatrix:alinamatrix_dev@localhost:5432/alinamatrix";

const describeIf = DATABASE_URL ? describe : describe.skip;

// ----------------------------------------------------------------
// Fixture IDs (tenants from seed/fixture.sql)
// ----------------------------------------------------------------
const TENANT_A = "aaaaaaaa-0000-4000-a000-000000000001";
const TENANT_B = "bbbbbbbb-0000-4000-b000-000000000002";

// Project IDs — phase-5-specific range (5500)
const PROJECT_A = "aaaaaaaa-5500-4000-a000-000000000401";
const PROJECT_B = "bbbbbbbb-5500-4000-b000-000000000402";

let appPool: DbPool;
let suPool: DbPool;

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

/** Run callback with tenant context using app pool (app_user role). */
async function withAppTenant<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return withTransaction(appPool, async (client: pg.PoolClient) => {
    await setTenantContext(client, tenantId);
    return fn(client);
  });
}

/** Run query without tenant context (fail-closed check). */
async function withNoContext<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return withTransaction(appPool, async (client: pg.PoolClient) => {
    await client.query("SELECT set_config('app.current_tenant_id', '', true)");
    return fn(client);
  });
}

// ----------------------------------------------------------------
// Shared test data (created by beforeAll)
// ----------------------------------------------------------------
let modelVersionId: string;
let promptVersionId: string;
let schemaVersionId: string;
let policyVersionId: string;
let agentVersionId: string;
let workflowIdA: string;
let workflowRunIdA: string;

// ----------------------------------------------------------------
// Setup / teardown
// ----------------------------------------------------------------
beforeAll(async () => {
  if (!DATABASE_URL) return;

  appPool = createPool(DATABASE_URL);
  suPool  = createPool(SUPERUSER_URL);

  // Create projects for the two test tenants (superuser, no RLS)
  await suPool.query(
    `INSERT INTO projects (id, tenant_id, name)
     VALUES ($1, $2, 'P5 Project Alpha') ON CONFLICT (id) DO NOTHING`,
    [PROJECT_A, TENANT_A],
  );
  await suPool.query(
    `INSERT INTO projects (id, tenant_id, name)
     VALUES ($1, $2, 'P5 Project Beta') ON CONFLICT (id) DO NOTHING`,
    [PROJECT_B, TENANT_B],
  );

  // Seed catalog rows (no RLS: use app pool as superuser is fine here too)
  const mv = await appPool.query(
    `INSERT INTO model_versions (model_id, provider, temperature)
     VALUES ('fake-model-p5', 'deterministic_fake', 0)
     ON CONFLICT (model_id, provider) DO UPDATE SET description = NULL
     RETURNING id`,
  );
  modelVersionId = mv.rows[0].id as string;

  const pv = await appPool.query(
    `INSERT INTO prompt_versions (name, version, text, sha256)
     VALUES ('p5-prompt', 1, 'You are AlinaArchitect.', $1)
     ON CONFLICT (sha256) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    ["p5".repeat(32)],
  );
  promptVersionId = pv.rows[0].id as string;

  const sv = await appPool.query(
    `INSERT INTO schema_versions (name, version, schema_json, sha256)
     VALUES ('p5-schema', 1, '{"type":"object"}', $1)
     ON CONFLICT (sha256) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    ["s5".repeat(32)],
  );
  schemaVersionId = sv.rows[0].id as string;

  const polv = await appPool.query(
    `INSERT INTO policy_versions (name, version, rules_json, sha256)
     VALUES ('p5-policy', 1, '{"rules":[]}', $1)
     ON CONFLICT (sha256) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    ["q5".repeat(32)],
  );
  policyVersionId = polv.rows[0].id as string;

  // Get the seeded AlinaArchitect agent id
  const agentRow = await appPool.query(
    `SELECT id FROM agents WHERE name = 'AlinaArchitect'`,
  );
  const agentId = agentRow.rows[0].id as string;

  // Create an agent version
  const av = await appPool.query(
    `INSERT INTO agent_versions
       (agent_id, version, model_version_id, prompt_version_id, schema_version_id, policy_version_id)
     VALUES ($1, 1, $2, $3, $4, $5)
     ON CONFLICT (agent_id, version) DO UPDATE SET agent_id = EXCLUDED.agent_id
     RETURNING id`,
    [agentId, modelVersionId, promptVersionId, schemaVersionId, policyVersionId],
  );
  agentVersionId = av.rows[0].id as string;

  // Create a workflow and run for TENANT_A
  workflowIdA = await withAppTenant(TENANT_A, async (client) => {
    const wf = await insertWorkflow(client, {
      tenantId:  TENANT_A,
      projectId: PROJECT_A,
      name:      "P5 Test Workflow",
    });
    return wf.id;
  });

  workflowRunIdA = await withAppTenant(TENANT_A, async (client) => {
    const wr = await insertWorkflowRun(client, {
      tenantId:   TENANT_A,
      workflowId: workflowIdA,
    });
    return wr.id;
  });
});

afterAll(async () => {
  if (!DATABASE_URL) return;
  await appPool?.end();
  await suPool?.end();
});

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------

describeIf("Phase 5 — live PostgreSQL", () => {

  // ---------- Agent catalog (seed verification) ----------

  it("four agents are seeded", async () => {
    const result = await appPool.query<{ name: string }>(
      "SELECT name FROM agents ORDER BY name",
    );
    expect(result.rows.map(r => r.name).sort()).toEqual([
      "AlinaArchitect",
      "AlinaDocEngine",
      "AlinaGuard",
      "AlinaOptimizer",
    ]);
  });

  it("AlinaArchitect has READ_SOURCE, READ_EVIDENCE, WRITE_DRAFT", async () => {
    const { rows } = await appPool.query<{ capabilities: string[] }>(
      "SELECT capabilities FROM agents WHERE name = 'AlinaArchitect'",
    );
    expect(rows[0]!.capabilities).toContain("READ_SOURCE");
    expect(rows[0]!.capabilities).toContain("READ_EVIDENCE");
    expect(rows[0]!.capabilities).toContain("WRITE_DRAFT");
    expect(rows[0]!.capabilities).not.toContain("RELEASE");
    expect(rows[0]!.capabilities).not.toContain("EXPORT");
  });

  it("AlinaGuard has READ_EVIDENCE, RUN_VALIDATION", async () => {
    const { rows } = await appPool.query<{ capabilities: string[] }>(
      "SELECT capabilities FROM agents WHERE name = 'AlinaGuard'",
    );
    expect(rows[0]!.capabilities).toContain("READ_EVIDENCE");
    expect(rows[0]!.capabilities).toContain("RUN_VALIDATION");
  });

  it("AlinaDocEngine has COMPILE_ARTIFACT", async () => {
    const { rows } = await appPool.query<{ capabilities: string[] }>(
      "SELECT capabilities FROM agents WHERE name = 'AlinaDocEngine'",
    );
    expect(rows[0]!.capabilities).toContain("COMPILE_ARTIFACT");
  });

  it("AlinaOptimizer has READ_USAGE, WRITE_CACHE_METADATA", async () => {
    const { rows } = await appPool.query<{ capabilities: string[] }>(
      "SELECT capabilities FROM agents WHERE name = 'AlinaOptimizer'",
    );
    expect(rows[0]!.capabilities).toContain("READ_USAGE");
    expect(rows[0]!.capabilities).toContain("WRITE_CACHE_METADATA");
  });

  // ---------- Workflow / workflow run ----------

  it("inserted workflow is readable by same tenant", async () => {
    const wf = await withAppTenant(TENANT_A, async (client) =>
      getWorkflow(client, workflowIdA),
    );
    expect(wf).not.toBeNull();
    expect(wf!.tenant_id).toBe(TENANT_A);
    expect(wf!.project_id).toBe(PROJECT_A);
  });

  it("workflow is not readable by different tenant (RLS)", async () => {
    const wf = await withAppTenant(TENANT_B, async (client) =>
      getWorkflow(client, workflowIdA),
    );
    expect(wf).toBeNull();
  });

  it("workflow_run returns null without tenant context (fail-closed)", async () => {
    const result = await withNoContext(async (client) =>
      getWorkflowRun(client, workflowRunIdA),
    );
    expect(result).toBeNull();
  });

  // ---------- Job idempotency ----------

  it("duplicate idempotency_key returns existing job (deduplicated)", async () => {
    const ikey = `ikey-p5-dedup-${Date.now()}`;

    const first = await withAppTenant(TENANT_A, async (client) =>
      insertJob(client, {
        tenantId:       TENANT_A,
        workflowRunId:  workflowRunIdA,
        idempotencyKey: ikey,
      }),
    );
    expect(first.deduplicated).toBe(false);

    const second = await withAppTenant(TENANT_A, async (client) =>
      insertJob(client, {
        tenantId:       TENANT_A,
        workflowRunId:  workflowRunIdA,
        idempotencyKey: ikey,
      }),
    );
    expect(second.deduplicated).toBe(true);
    expect(second.row.id).toBe(first.row.id);
  });

  // ---------- Illegal transition ----------

  it("transitionJobState rejects illegal jump (INGESTED -> RELEASED)", async () => {
    const ikey = `ikey-p5-illegal-${Date.now()}`;
    const { row: job } = await withAppTenant(TENANT_A, async (client) =>
      insertJob(client, { tenantId: TENANT_A, workflowRunId: workflowRunIdA, idempotencyKey: ikey }),
    );

    await expect(
      withAppTenant(TENANT_A, async (client) =>
        transitionJobState(client, job.id, TENANT_A, "INGESTED", "RELEASED"),
      ),
    ).rejects.toThrow(/Illegal workflow transition/);
  });

  it("transitionJobState advances INGESTED -> CLASSIFIED legally", async () => {
    const ikey = `ikey-p5-legal-${Date.now()}`;
    const { row: job } = await withAppTenant(TENANT_A, async (client) =>
      insertJob(client, { tenantId: TENANT_A, workflowRunId: workflowRunIdA, idempotencyKey: ikey }),
    );

    await withAppTenant(TENANT_A, async (client) =>
      transitionJobState(client, job.id, TENANT_A, "INGESTED", "CLASSIFIED"),
    );

    const updated = await withAppTenant(TENANT_A, async (client) =>
      getJob(client, job.id),
    );
    expect(updated!.state).toBe("CLASSIFIED");
  });

  // ---------- Cancellation: cancelled job cannot publish ----------

  it("cancelled job state is CANCELLED and domain guard prevents advance", async () => {
    const ikey = `ikey-p5-cancel-${Date.now()}`;
    const { row: job } = await withAppTenant(TENANT_A, async (client) =>
      insertJob(client, { tenantId: TENANT_A, workflowRunId: workflowRunIdA, idempotencyKey: ikey }),
    );

    // Cancel the job
    await withAppTenant(TENANT_A, async (client) =>
      transitionJobState(client, job.id, TENANT_A, "INGESTED", "CANCELLED"),
    );

    const cancelled = await withAppTenant(TENANT_A, async (client) =>
      getJob(client, job.id),
    );
    expect(cancelled!.state).toBe("CANCELLED");

    // assertJobNotCancelled domain guard
    const { assertJobNotCancelled } = await import("@alinamatrix/domain");
    expect(() => assertJobNotCancelled(job.id, "CANCELLED")).toThrow();
  });

  it("CANCELLED -> GENERATED is rejected by domain transition guard", async () => {
    const ikey = `ikey-p5-cancel2-${Date.now()}`;
    const { row: job } = await withAppTenant(TENANT_A, async (client) =>
      insertJob(client, { tenantId: TENANT_A, workflowRunId: workflowRunIdA, idempotencyKey: ikey }),
    );

    await withAppTenant(TENANT_A, async (client) =>
      transitionJobState(client, job.id, TENANT_A, "INGESTED", "CANCELLED"),
    );

    await expect(
      withAppTenant(TENANT_A, async (client) =>
        transitionJobState(client, job.id, TENANT_A, "CANCELLED", "GENERATED"),
      ),
    ).rejects.toThrow(/Illegal workflow transition/);
  });

  // ---------- Job events (append-only) ----------

  it("job_events accumulate correctly", async () => {
    const ikey = `ikey-p5-events-${Date.now()}`;
    const { row: job } = await withAppTenant(TENANT_A, async (client) =>
      insertJob(client, { tenantId: TENANT_A, workflowRunId: workflowRunIdA, idempotencyKey: ikey }),
    );

    await withAppTenant(TENANT_A, async (client) =>
      transitionJobState(client, job.id, TENANT_A, "INGESTED", "CLASSIFIED"),
    );
    await withAppTenant(TENANT_A, async (client) =>
      transitionJobState(client, job.id, TENANT_A, "CLASSIFIED", "EXTRACTED"),
    );

    const events = await withAppTenant(TENANT_A, async (client) =>
      listJobEvents(client, job.id),
    );
    expect(events).toHaveLength(2);
    expect(events[0]!.from_state).toBe("INGESTED");
    expect(events[0]!.to_state).toBe("CLASSIFIED");
    expect(events[1]!.from_state).toBe("CLASSIFIED");
    expect(events[1]!.to_state).toBe("EXTRACTED");
  });

  it("job_events cross-tenant SELECT returns empty (RLS)", async () => {
    const ikey = `ikey-p5-event-xtan-${Date.now()}`;
    const { row: job } = await withAppTenant(TENANT_A, async (client) =>
      insertJob(client, { tenantId: TENANT_A, workflowRunId: workflowRunIdA, idempotencyKey: ikey }),
    );

    await withAppTenant(TENANT_A, async (client) =>
      appendJobEvent(client, {
        tenantId:  TENANT_A,
        jobId:     job.id,
        fromState: "INGESTED",
        toState:   "CLASSIFIED",
      }),
    );

    const events = await withAppTenant(TENANT_B, async (client) =>
      listJobEvents(client, job.id),
    );
    expect(events).toHaveLength(0);
  });

  // ---------- Usage events ----------

  it("inserts a usage event and lists it by project", async () => {
    const ikey = `ikey-p5-usage-${Date.now()}`;
    const { row: job } = await withAppTenant(TENANT_A, async (client) =>
      insertJob(client, { tenantId: TENANT_A, workflowRunId: workflowRunIdA, idempotencyKey: ikey }),
    );

    const agentRun = await withAppTenant(TENANT_A, async (client) =>
      insertAgentRun(client, {
        tenantId:       TENANT_A,
        jobId:          job.id,
        agentVersionId: agentVersionId,
        inputHash:      "a".repeat(64),
      }),
    );

    await withAppTenant(TENANT_A, async (client) =>
      completeAgentRun(client, agentRun.id, {
        outputJson: { result: "ok" },
        state:      "SUCCEEDED",
      }),
    );

    await withAppTenant(TENANT_A, async (client) =>
      insertUsageEvent(client, {
        tenantId:         TENANT_A,
        projectId:        PROJECT_A,
        agentRunId:       agentRun.id,
        agentVersionId:   agentVersionId,
        modelVersionId:   modelVersionId,
        promptTokens:     120,
        completionTokens: 60,
        costMinorUnits:   600,
      }),
    );

    const events = await withAppTenant(TENANT_A, async (client) =>
      listUsageEventsByProject(client, PROJECT_A),
    );
    expect(events.length).toBeGreaterThanOrEqual(1);
    const latest = events[events.length - 1]!;
    expect(latest.prompt_tokens).toBe(120);
    expect(latest.completion_tokens).toBe(60);
  });

  it("usage events cross-tenant SELECT returns empty (RLS)", async () => {
    const events = await withAppTenant(TENANT_B, async (client) =>
      listUsageEventsByProject(client, PROJECT_A),
    );
    expect(events).toHaveLength(0);
  });

  // ---------- Cache isolation (cross-tenant miss) ----------

  it("cache entry inserted by tenant A is not found by tenant B", async () => {
    const { buildCacheKey } = await import("@alinamatrix/domain");

    const paramsA = {
      tenantId:         TENANT_A,
      sourceVersionIds: ["sv-p5-a"],
      promptSha256:     "a".repeat(64),
      modelId:          "fake-model-p5",
      schemaSha256:     "b".repeat(64),
      policySha256:     "c".repeat(64),
      inputHash:        "d".repeat(64),
    };
    const cacheKeyA = buildCacheKey(paramsA);

    // Insert under TENANT_A
    await withAppTenant(TENANT_A, async (client) =>
      getOrInsertCacheEntry(client, {
        tenantId:         TENANT_A,
        cacheKey:         cacheKeyA,
        outputJson:       { result: "fake-a" },
        promptVersionId:  promptVersionId,
        modelVersionId:   modelVersionId,
        schemaVersionId:  schemaVersionId,
        policyVersionId:  policyVersionId,
      }),
    );

    // TENANT_B with the same logical params produces a different key
    const paramsB = { ...paramsA, tenantId: TENANT_B };
    const cacheKeyB = buildCacheKey(paramsB);
    expect(cacheKeyA).not.toBe(cacheKeyB); // structural guarantee

    // Even if TENANT_B tries to look up TENANT_A's key, RLS blocks it
    const miss = await withAppTenant(TENANT_B, async (client) =>
      getCacheEntry(client, cacheKeyA),
    );
    expect(miss).toBeNull();
  });

  it("cache key is consistent for same tenant and params (determinism)", async () => {
    const { buildCacheKey } = await import("@alinamatrix/domain");

    const params = {
      tenantId:         TENANT_A,
      sourceVersionIds: ["sv-determinism"],
      promptSha256:     "e".repeat(64),
      modelId:          "fake-model-p5",
      schemaSha256:     "f".repeat(64),
      policySha256:     "0".repeat(64),
      inputHash:        "1".repeat(64),
    };
    expect(buildCacheKey(params)).toBe(buildCacheKey({ ...params }));
  });

  // ---------- Capability denial (DB capability array check) ----------

  it("AlinaArchitect capabilities do not include RELEASE or EXPORT in DB", async () => {
    const { rows } = await appPool.query<{ capabilities: string[] }>(
      "SELECT capabilities FROM agents WHERE name = 'AlinaArchitect'",
    );
    expect(rows[0]!.capabilities).not.toContain("RELEASE");
    expect(rows[0]!.capabilities).not.toContain("EXPORT");
  });

  it("no agent in DB has RELEASE or EXPORT capability", async () => {
    const { rows } = await appPool.query<{ capabilities: string[] }>(
      "SELECT capabilities FROM agents",
    );
    for (const row of rows) {
      expect(row.capabilities).not.toContain("RELEASE");
      expect(row.capabilities).not.toContain("EXPORT");
    }
  });

  // ---------- Fail-closed (no tenant context) ----------

  it("processing_jobs returns empty without tenant context (fail-closed)", async () => {
    const result = await withNoContext(async (client) => {
      const r = await client.query("SELECT * FROM processing_jobs LIMIT 1");
      return r.rows;
    });
    expect(result).toHaveLength(0);
  });

  it("cache_entries returns empty without tenant context (fail-closed)", async () => {
    const result = await withNoContext(async (client) => {
      const r = await client.query("SELECT * FROM cache_entries LIMIT 1");
      return r.rows;
    });
    expect(result).toHaveLength(0);
  });

  // ---------- Agent run complete ----------

  it("completed agent run has SUCCEEDED state and output_json", async () => {
    const ikey = `ikey-p5-run-${Date.now()}`;
    const { row: job } = await withAppTenant(TENANT_A, async (client) =>
      insertJob(client, { tenantId: TENANT_A, workflowRunId: workflowRunIdA, idempotencyKey: ikey }),
    );

    const run = await withAppTenant(TENANT_A, async (client) =>
      insertAgentRun(client, {
        tenantId:       TENANT_A,
        jobId:          job.id,
        agentVersionId: agentVersionId,
        inputHash:      "b".repeat(64),
      }),
    );

    await withAppTenant(TENANT_A, async (client) =>
      completeAgentRun(client, run.id, {
        outputJson: { _provider: "DeterministicFakeProvider", result: "ok" },
        state:      "SUCCEEDED",
      }),
    );

    const completed = await withAppTenant(TENANT_A, async (client) =>
      getAgentRun(client, run.id),
    );
    expect(completed!.state).toBe("SUCCEEDED");
    expect(completed!.output_json).not.toBeNull();
    expect((completed!.output_json as Record<string, unknown>)["_provider"])
      .toBe("DeterministicFakeProvider");
  });
});
