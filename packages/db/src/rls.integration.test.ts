/**
 * Live RLS integration tests.
 * Requires a running PostgreSQL with the Phase 2 migration and fixture seed applied.
 * Skipped automatically when DATABASE_URL is not set.
 *
 * Run:
 *   DATABASE_URL=postgres://app_user:app_user_dev@localhost:5432/alinamatrix \
 *   SUPERUSER_URL=postgres://alinamatrix:alinamatrix_dev@localhost:5432/alinamatrix \
 *     pnpm exec vitest run src/rls.integration.test.ts
 *
 * Or use the npm script: pnpm test:integration
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPool, withTransaction, setTenantContext } from "../src/index.js";
import type { DbPool } from "../src/index.js";
import type pg from "pg";

const DATABASE_URL = process.env["DATABASE_URL"];
// Superuser URL used only for test fixture setup/teardown (bypasses RLS)
const SUPERUSER_URL =
  process.env["SUPERUSER_URL"] ?? "postgres://alinamatrix:alinamatrix_dev@localhost:5432/alinamatrix";

const describeIf = DATABASE_URL ? describe : describe.skip;

// Fixture IDs matching packages/db/seed/fixture.sql
const TENANT_A = "aaaaaaaa-0000-4000-a000-000000000001";
const TENANT_B = "bbbbbbbb-0000-4000-b000-000000000002";
const USER_ALPHA = "aaaaaaaa-0000-4000-a000-000000000101"; // member of Tenant A
const PROJECT_A_ID = "aaaaaaaa-0000-4000-a000-000000000301";
const PROJECT_B_ID = "bbbbbbbb-0000-4000-b000-000000000302";

// Pool that connects as app_user — subject to RLS
let appPool: DbPool;
// Pool that connects as superuser — used only for setup/teardown
let suPool: DbPool;

beforeAll(async () => {
  if (!DATABASE_URL) return;
  appPool = createPool(DATABASE_URL);
  suPool = createPool(SUPERUSER_URL);

  // Insert test projects via the superuser pool (bypasses RLS for setup only)
  await suPool.query(
    "INSERT INTO projects (id, tenant_id, name) VALUES ($1, $2, 'Project Alpha') ON CONFLICT (id) DO NOTHING",
    [PROJECT_A_ID, TENANT_A],
  );
  await suPool.query(
    "INSERT INTO projects (id, tenant_id, name) VALUES ($1, $2, 'Project Beta') ON CONFLICT (id) DO NOTHING",
    [PROJECT_B_ID, TENANT_B],
  );
});

afterAll(async () => {
  if (suPool) {
    // Clean up test-only projects (fixture users/tenants stay)
    await suPool.query("DELETE FROM projects WHERE id = ANY($1)", [
      [PROJECT_A_ID, PROJECT_B_ID],
    ]);
    await suPool.end();
  }
  if (appPool) await appPool.end();
});

// ----------------------------------------------------------------
// Helper: run a query in a transaction under a given tenant context
// via the app_user pool (RLS-enforced)
// ----------------------------------------------------------------
async function queryAs<T extends Record<string, unknown>>(
  tenantId: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return withTransaction(appPool, async (client: pg.PoolClient) => {
    await setTenantContext(client, tenantId);
    const result = await client.query<T>(sql, params);
    return result.rows;
  });
}

// ----------------------------------------------------------------
// Helper: run a query with NO tenant context (fail-closed check)
// ----------------------------------------------------------------
async function queryNoContext<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return withTransaction(appPool, async (client: pg.PoolClient) => {
    await client.query("SELECT set_config('app.current_tenant_id', '', true)");
    const result = await client.query<T>(sql, params);
    return result.rows;
  });
}

// ----------------------------------------------------------------
// Live RLS tests
// ----------------------------------------------------------------
describeIf("RLS live integration — Tenant A vs Tenant B isolation", () => {
  it("Tenant A context sees only Tenant A in tenants table", async () => {
    const rows = await queryAs<{ id: string }>(TENANT_A, "SELECT id FROM tenants");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(TENANT_A);
  });

  it("Tenant B context sees only Tenant B in tenants table", async () => {
    const rows = await queryAs<{ id: string }>(TENANT_B, "SELECT id FROM tenants");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(TENANT_B);
  });

  it("Tenant A context cannot read Tenant B projects", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_A,
      "SELECT id FROM projects WHERE id = $1",
      [PROJECT_B_ID],
    );
    expect(rows).toHaveLength(0);
  });

  it("Tenant B context cannot read Tenant A projects", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_B,
      "SELECT id FROM projects WHERE id = $1",
      [PROJECT_A_ID],
    );
    expect(rows).toHaveLength(0);
  });

  it("Tenant A context sees its own project", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_A,
      "SELECT id FROM projects WHERE id = $1",
      [PROJECT_A_ID],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(PROJECT_A_ID);
  });

  it("Tenant B context sees its own project", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_B,
      "SELECT id FROM projects WHERE id = $1",
      [PROJECT_B_ID],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(PROJECT_B_ID);
  });

  it("Tenant A context cannot read Tenant B memberships", async () => {
    const rows = await queryAs<{ tenant_id: string }>(
      TENANT_A,
      "SELECT tenant_id FROM memberships WHERE tenant_id = $1",
      [TENANT_B],
    );
    expect(rows).toHaveLength(0);
  });

  it("Tenant B context cannot read Tenant A memberships", async () => {
    const rows = await queryAs<{ tenant_id: string }>(
      TENANT_B,
      "SELECT tenant_id FROM memberships WHERE tenant_id = $1",
      [TENANT_A],
    );
    expect(rows).toHaveLength(0);
  });

  it("missing tenant context returns no rows from tenants — fail closed", async () => {
    const rows = await queryNoContext<{ id: string }>("SELECT id FROM tenants");
    expect(rows).toHaveLength(0);
  });

  it("missing tenant context returns no rows from projects — fail closed", async () => {
    const rows = await queryNoContext<{ id: string }>("SELECT id FROM projects");
    expect(rows).toHaveLength(0);
  });

  it("missing tenant context returns no rows from memberships — fail closed", async () => {
    const rows = await queryNoContext<{ id: string }>("SELECT id FROM memberships");
    expect(rows).toHaveLength(0);
  });

  it("Tenant A context cannot INSERT a project into Tenant B (WITH CHECK rejects)", async () => {
    await expect(
      queryAs(
        TENANT_A,
        "INSERT INTO projects (id, tenant_id, name) VALUES (gen_random_uuid(), $1, 'Cross-tenant attempt')",
        [TENANT_B],
      ),
    ).rejects.toThrow();
  });

  it("audit_events UPDATE is denied (no UPDATE policy — 0 rows affected)", async () => {
    // Insert an audit event as Tenant A via superuser pool (setup)
    await suPool.query(
      "INSERT INTO audit_events (id, tenant_id, user_id, action, resource) VALUES (gen_random_uuid(), $1, $2, 'test.rls', 'test') ON CONFLICT DO NOTHING",
      [TENANT_A, USER_ALPHA],
    );
    // PostgreSQL RLS with no UPDATE policy: the statement executes but matches 0 rows.
    // The audit row is protected — it cannot be mutated. Verify nothing changes.
    const before = await withTransaction(suPool, async (c: pg.PoolClient) => {
      const r = await c.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM audit_events WHERE tenant_id = $1 AND action = 'test.rls'",
        [TENANT_A],
      );
      return Number(r.rows[0]?.count ?? "0");
    });

    await queryAs(
      TENANT_A,
      "UPDATE audit_events SET action = 'tampered' WHERE tenant_id = $1",
      [TENANT_A],
    );

    const after = await withTransaction(suPool, async (c: pg.PoolClient) => {
      // 'tampered' action would exist if UPDATE succeeded; 'test.rls' count unchanged means denied
      const r = await c.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM audit_events WHERE tenant_id = $1 AND action = 'tampered'",
        [TENANT_A],
      );
      return Number(r.rows[0]?.count ?? "0");
    });

    // No 'tampered' rows — the update was silently blocked by RLS (0 rows matched the UPDATE policy)
    expect(after).toBe(0);
    // Original rows still intact
    expect(before).toBeGreaterThan(0);
  });

  it("audit_events DELETE is denied (no DELETE policy — 0 rows affected)", async () => {
    // Count rows before
    const before = await withTransaction(suPool, async (c: pg.PoolClient) => {
      const r = await c.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM audit_events WHERE tenant_id = $1",
        [TENANT_A],
      );
      return Number(r.rows[0]?.count ?? "0");
    });

    // app_user attempts DELETE — no DELETE policy means 0 rows affected (silent deny)
    await queryAs(TENANT_A, "DELETE FROM audit_events WHERE tenant_id = $1", [TENANT_A]);

    // Count via superuser — rows must be unchanged
    const after = await withTransaction(suPool, async (c: pg.PoolClient) => {
      const r = await c.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM audit_events WHERE tenant_id = $1",
        [TENANT_A],
      );
      return Number(r.rows[0]?.count ?? "0");
    });

    expect(after).toBe(before);
    expect(after).toBeGreaterThan(0);
  });
});
