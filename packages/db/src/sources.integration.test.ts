/**
 * Live RLS integration tests for Phase 3 tables:
 * sources, source_versions, source_fragments, evidence_items.
 *
 * Requires a running PostgreSQL with migrations 001 and 002 applied
 * and the fixture seed loaded.
 *
 * Skipped automatically when DATABASE_URL is not set.
 *
 * Run:
 *   DATABASE_URL=postgres://app_user:app_user_dev@localhost:5432/alinamatrix \
 *   SUPERUSER_URL=postgres://alinamatrix:alinamatrix_dev@localhost:5432/alinamatrix \
 *     pnpm exec vitest run src/sources.integration.test.ts
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPool, withTransaction, setTenantContext } from "../src/index.js";
import type { DbPool } from "../src/index.js";
import type pg from "pg";

const DATABASE_URL = process.env["DATABASE_URL"];
const SUPERUSER_URL =
  process.env["SUPERUSER_URL"] ??
  "postgres://alinamatrix:alinamatrix_dev@localhost:5432/alinamatrix";

const describeIf = DATABASE_URL ? describe : describe.skip;

// ----------------------------------------------------------------
// Fixed fixture IDs (matching seed/fixture.sql)
// ----------------------------------------------------------------
const TENANT_A = "aaaaaaaa-0000-4000-a000-000000000001";
const TENANT_B = "bbbbbbbb-0000-4000-b000-000000000002";

// Project IDs — distinct from the ones used in rls.integration.test.ts to avoid cascade collisions
const PROJECT_A = "aaaaaaaa-3300-4000-a000-000000000301";
const PROJECT_B = "bbbbbbbb-3300-4000-b000-000000000302";

// Source / version / fragment / evidence IDs managed by this test suite
const SOURCE_A = "dddddddd-3300-4000-d000-000000000001";
const SOURCE_B = "dddddddd-3300-4000-d000-000000000002";
const VERSION_A = "eeeeeeee-3300-4000-e000-000000000001";
const VERSION_B = "eeeeeeee-3300-4000-e000-000000000002";
const FRAGMENT_A = "ffffffff-3300-4000-f000-000000000001";
const FRAGMENT_B = "ffffffff-3300-4000-f000-000000000002";
const EVIDENCE_A = "11111111-3300-4000-b000-000000000001";
const EVIDENCE_B = "22222222-3300-4000-b000-000000000002";

let appPool: DbPool;
let suPool: DbPool;

// ----------------------------------------------------------------
// Helpers
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
// Setup / teardown
// ----------------------------------------------------------------
beforeAll(async () => {
  if (!DATABASE_URL) return;
  appPool = createPool(DATABASE_URL);
  suPool = createPool(SUPERUSER_URL);

  // Projects (referenced by sources)
  await suPool.query(
    `INSERT INTO projects (id, tenant_id, name) VALUES ($1, $2, 'Project Alpha P3') ON CONFLICT (id) DO NOTHING`,
    [PROJECT_A, TENANT_A],
  );
  await suPool.query(
    `INSERT INTO projects (id, tenant_id, name) VALUES ($1, $2, 'Project Beta P3') ON CONFLICT (id) DO NOTHING`,
    [PROJECT_B, TENANT_B],
  );

  // Sources — one per tenant, inserted via superuser for deterministic IDs
  await suPool.query(
    `INSERT INTO sources (id, tenant_id, project_id, name, mime_type)
     VALUES ($1, $2, $3, 'doc-alpha.txt', 'text/plain') ON CONFLICT (id) DO NOTHING`,
    [SOURCE_A, TENANT_A, PROJECT_A],
  );
  await suPool.query(
    `INSERT INTO sources (id, tenant_id, project_id, name, mime_type)
     VALUES ($1, $2, $3, 'doc-beta.txt', 'text/plain') ON CONFLICT (id) DO NOTHING`,
    [SOURCE_B, TENANT_B, PROJECT_B],
  );

  // Source versions — one per tenant
  await suPool.query(
    `INSERT INTO source_versions
       (id, source_id, tenant_id, sha256, size_bytes, storage_path, idempotency_key, status)
     VALUES ($1, $2, $3, $4, 100, $5, 'ikey-a-001', 'INGESTED') ON CONFLICT (id) DO NOTHING`,
    [VERSION_A, SOURCE_A, TENANT_A, "a".repeat(64), `${SOURCE_A}/${"a".repeat(64)}`],
  );
  await suPool.query(
    `INSERT INTO source_versions
       (id, source_id, tenant_id, sha256, size_bytes, storage_path, idempotency_key, status)
     VALUES ($1, $2, $3, $4, 200, $5, 'ikey-b-001', 'INGESTED') ON CONFLICT (id) DO NOTHING`,
    [VERSION_B, SOURCE_B, TENANT_B, "b".repeat(64), `${SOURCE_B}/${"b".repeat(64)}`],
  );

  // Source fragments — one per tenant
  await suPool.query(
    `INSERT INTO source_fragments
       (id, version_id, tenant_id, ordinal, page, text, char_start, char_end, hash)
     VALUES ($1, $2, $3, 0, null, 'Alpha fragment text', 0, 19, $4) ON CONFLICT (id) DO NOTHING`,
    [FRAGMENT_A, VERSION_A, TENANT_A, "fa".repeat(32)],
  );
  await suPool.query(
    `INSERT INTO source_fragments
       (id, version_id, tenant_id, ordinal, page, text, char_start, char_end, hash)
     VALUES ($1, $2, $3, 0, null, 'Beta fragment text', 0, 18, $4) ON CONFLICT (id) DO NOTHING`,
    [FRAGMENT_B, VERSION_B, TENANT_B, "fb".repeat(32)],
  );

  // Evidence items — one per tenant
  await suPool.query(
    `INSERT INTO evidence_items (id, version_id, fragment_id, tenant_id, kind, text)
     VALUES ($1, $2, $3, $4, 'statement', 'Alpha evidence text') ON CONFLICT (id) DO NOTHING`,
    [EVIDENCE_A, VERSION_A, FRAGMENT_A, TENANT_A],
  );
  await suPool.query(
    `INSERT INTO evidence_items (id, version_id, fragment_id, tenant_id, kind, text)
     VALUES ($1, $2, $3, $4, 'data_point', 'Beta evidence text') ON CONFLICT (id) DO NOTHING`,
    [EVIDENCE_B, VERSION_B, FRAGMENT_B, TENANT_B],
  );
});

afterAll(async () => {
  if (suPool) {
    // Clean up in dependency order (children first)
    await suPool.query("DELETE FROM evidence_items WHERE id = ANY($1)", [
      [EVIDENCE_A, EVIDENCE_B],
    ]);
    await suPool.query("DELETE FROM source_fragments WHERE id = ANY($1)", [
      [FRAGMENT_A, FRAGMENT_B],
    ]);
    await suPool.query("DELETE FROM source_versions WHERE id = ANY($1)", [
      [VERSION_A, VERSION_B],
    ]);
    await suPool.query("DELETE FROM sources WHERE id = ANY($1)", [
      [SOURCE_A, SOURCE_B],
    ]);
    await suPool.query("DELETE FROM projects WHERE id = ANY($1)", [
      [PROJECT_A, PROJECT_B],
    ]);
    await suPool.end();
  }
  if (appPool) await appPool.end();
});

// ================================================================
// sources — RLS live tests
// ================================================================
describeIf("RLS live — sources: Tenant A vs Tenant B isolation", () => {
  it("Tenant A context sees its own source row", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_A,
      "SELECT id FROM sources WHERE id = $1",
      [SOURCE_A],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(SOURCE_A);
  });

  it("Tenant B context sees its own source row", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_B,
      "SELECT id FROM sources WHERE id = $1",
      [SOURCE_B],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(SOURCE_B);
  });

  it("Tenant A context cannot read Tenant B source", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_A,
      "SELECT id FROM sources WHERE id = $1",
      [SOURCE_B],
    );
    expect(rows).toHaveLength(0);
  });

  it("Tenant B context cannot read Tenant A source", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_B,
      "SELECT id FROM sources WHERE id = $1",
      [SOURCE_A],
    );
    expect(rows).toHaveLength(0);
  });

  it("missing tenant context returns no rows from sources — fail closed", async () => {
    const rows = await queryNoContext<{ id: string }>("SELECT id FROM sources");
    expect(rows).toHaveLength(0);
  });

  it("Tenant A cannot INSERT a source into Tenant B (WITH CHECK rejects)", async () => {
    await expect(
      queryAs(
        TENANT_A,
        "INSERT INTO sources (id, tenant_id, project_id, name, mime_type) VALUES (gen_random_uuid(), $1, $2, 'cross', 'text/plain')",
        [TENANT_B, PROJECT_B],
      ),
    ).rejects.toThrow();
  });
});

// ================================================================
// source_versions — RLS live tests
// ================================================================
describeIf("RLS live — source_versions: Tenant A vs Tenant B isolation", () => {
  it("Tenant A context sees its own version row", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_A,
      "SELECT id FROM source_versions WHERE id = $1",
      [VERSION_A],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(VERSION_A);
  });

  it("Tenant B context sees its own version row", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_B,
      "SELECT id FROM source_versions WHERE id = $1",
      [VERSION_B],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(VERSION_B);
  });

  it("Tenant A context cannot read Tenant B version", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_A,
      "SELECT id FROM source_versions WHERE id = $1",
      [VERSION_B],
    );
    expect(rows).toHaveLength(0);
  });

  it("Tenant B context cannot read Tenant A version", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_B,
      "SELECT id FROM source_versions WHERE id = $1",
      [VERSION_A],
    );
    expect(rows).toHaveLength(0);
  });

  it("missing tenant context returns no rows from source_versions — fail closed", async () => {
    const rows = await queryNoContext<{ id: string }>("SELECT id FROM source_versions");
    expect(rows).toHaveLength(0);
  });

  it("Tenant A cannot INSERT a version into Tenant B (WITH CHECK rejects)", async () => {
    await expect(
      queryAs(
        TENANT_A,
        `INSERT INTO source_versions
           (source_id, tenant_id, sha256, size_bytes, storage_path, idempotency_key)
         VALUES ($1, $2, $3, 10, 'x/y', 'cross-key')`,
        [SOURCE_B, TENANT_B, "c".repeat(64)],
      ),
    ).rejects.toThrow();
  });

  it("source_versions DELETE is silently blocked (no DELETE policy — 0 rows affected)", async () => {
    const before = await withTransaction(suPool, async (c: pg.PoolClient) => {
      const r = await c.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM source_versions WHERE id = $1",
        [VERSION_A],
      );
      return Number(r.rows[0]?.count ?? "0");
    });
    expect(before).toBe(1);

    // app_user DELETE — no DELETE policy means 0 rows affected (silent deny)
    await queryAs(
      TENANT_A,
      "DELETE FROM source_versions WHERE id = $1",
      [VERSION_A],
    );

    const after = await withTransaction(suPool, async (c: pg.PoolClient) => {
      const r = await c.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM source_versions WHERE id = $1",
        [VERSION_A],
      );
      return Number(r.rows[0]?.count ?? "0");
    });
    // Row is still there — DELETE was silently blocked by absence of DELETE policy
    expect(after).toBe(1);
  });

  it("source_versions status UPDATE is allowed within tenant (sv_update_status policy)", async () => {
    await queryAs(
      TENANT_A,
      "UPDATE source_versions SET status = 'EXTRACTED' WHERE id = $1",
      [VERSION_A],
    );

    const rows = await withTransaction(suPool, async (c: pg.PoolClient) => {
      const r = await c.query<{ status: string }>(
        "SELECT status FROM source_versions WHERE id = $1",
        [VERSION_A],
      );
      return r.rows;
    });
    expect(rows[0]?.status).toBe("EXTRACTED");

    // Reset to INGESTED for other test isolation
    await suPool.query(
      "UPDATE source_versions SET status = 'INGESTED' WHERE id = $1",
      [VERSION_A],
    );
  });
});

// ================================================================
// source_fragments — RLS live tests
// ================================================================
describeIf("RLS live — source_fragments: Tenant A vs Tenant B isolation", () => {
  it("Tenant A context sees its own fragment", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_A,
      "SELECT id FROM source_fragments WHERE id = $1",
      [FRAGMENT_A],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(FRAGMENT_A);
  });

  it("Tenant B context sees its own fragment", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_B,
      "SELECT id FROM source_fragments WHERE id = $1",
      [FRAGMENT_B],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(FRAGMENT_B);
  });

  it("Tenant A context cannot read Tenant B fragment", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_A,
      "SELECT id FROM source_fragments WHERE id = $1",
      [FRAGMENT_B],
    );
    expect(rows).toHaveLength(0);
  });

  it("Tenant B context cannot read Tenant A fragment", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_B,
      "SELECT id FROM source_fragments WHERE id = $1",
      [FRAGMENT_A],
    );
    expect(rows).toHaveLength(0);
  });

  it("missing tenant context returns no rows from source_fragments — fail closed", async () => {
    const rows = await queryNoContext<{ id: string }>("SELECT id FROM source_fragments");
    expect(rows).toHaveLength(0);
  });

  it("Tenant A cannot INSERT a fragment into Tenant B (WITH CHECK rejects)", async () => {
    await expect(
      queryAs(
        TENANT_A,
        `INSERT INTO source_fragments
           (version_id, tenant_id, ordinal, text, char_start, char_end, hash)
         VALUES ($1, $2, 99, 'cross', 0, 5, $3)`,
        [VERSION_B, TENANT_B, "cc".repeat(32)],
      ),
    ).rejects.toThrow();
  });

  it("source_fragments DELETE is silently blocked (no DELETE policy — immutable)", async () => {
    const before = await withTransaction(suPool, async (c: pg.PoolClient) => {
      const r = await c.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM source_fragments WHERE id = $1",
        [FRAGMENT_A],
      );
      return Number(r.rows[0]?.count ?? "0");
    });
    expect(before).toBe(1);

    await queryAs(
      TENANT_A,
      "DELETE FROM source_fragments WHERE id = $1",
      [FRAGMENT_A],
    );

    const after = await withTransaction(suPool, async (c: pg.PoolClient) => {
      const r = await c.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM source_fragments WHERE id = $1",
        [FRAGMENT_A],
      );
      return Number(r.rows[0]?.count ?? "0");
    });
    expect(after).toBe(1);
  });
});
