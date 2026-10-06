/**
 * Live PostgreSQL integration tests for Phase 4 tables:
 * claims, citations, assumptions, terminology_entries, claim_edges.
 *
 * Requires a running PostgreSQL with migrations 001, 002, and 003 applied
 * and the fixture seed loaded.
 *
 * Skipped automatically when DATABASE_URL is not set.
 *
 * Run:
 *   DATABASE_URL=postgres://app_user:app_user_dev@localhost:5432/alinamatrix \
 *   SUPERUSER_URL=postgres://alinamatrix:alinamatrix_dev@localhost:5432/alinamatrix \
 *     pnpm exec vitest run src/claims.integration.test.ts
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPool, withTransaction, setTenantContext } from "../src/index.js";
import {
  insertClaim,
  getClaim,
  insertCitation,
  insertAssumption,
  insertTerminologyEntry,
  getTerminologyEntry,
  insertClaimEdge,
  getClaimEdges,
} from "../src/claims.js";
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

// Project IDs specific to Phase 4 integration suite
// Use a distinct UUID range (4400) to avoid collisions with Phase 2/3 test suites
const PROJECT_A = "aaaaaaaa-4400-4000-a000-000000000301";
const PROJECT_B = "bbbbbbbb-4400-4000-b000-000000000302";

// Source / version / fragment / evidence IDs
const SOURCE_A   = "dddddddd-4400-4000-d000-000000000001";
const SOURCE_B   = "dddddddd-4400-4000-d000-000000000002";
const VERSION_A  = "eeeeeeee-4400-4000-e000-000000000001";
const VERSION_B  = "eeeeeeee-4400-4000-e000-000000000002";
const FRAGMENT_A = "ffffffff-4400-4000-f000-000000000001";
const FRAGMENT_B = "ffffffff-4400-4000-f000-000000000002";
const EVIDENCE_A = "11111111-4400-4000-b000-000000000001";
const EVIDENCE_B = "22222222-4400-4000-b000-000000000002";

// Claim IDs seeded via superuser in beforeAll
const CLAIM_A = "cccccccc-4400-4000-c000-000000000001";
const CLAIM_B = "cccccccc-4400-4000-c000-000000000002";

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

/** Run a callback with a tenant-context client from the app pool. */
async function withAppTenant<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return withTransaction(appPool, async (client: pg.PoolClient) => {
    await setTenantContext(client, tenantId);
    return fn(client);
  });
}

// ----------------------------------------------------------------
// Setup / teardown
// ----------------------------------------------------------------
beforeAll(async () => {
  if (!DATABASE_URL) return;
  appPool = createPool(DATABASE_URL);
  suPool  = createPool(SUPERUSER_URL);

  // Projects
  await suPool.query(
    `INSERT INTO projects (id, tenant_id, name) VALUES ($1, $2, 'Project Alpha P4') ON CONFLICT (id) DO NOTHING`,
    [PROJECT_A, TENANT_A],
  );
  await suPool.query(
    `INSERT INTO projects (id, tenant_id, name) VALUES ($1, $2, 'Project Beta P4') ON CONFLICT (id) DO NOTHING`,
    [PROJECT_B, TENANT_B],
  );

  // Sources
  await suPool.query(
    `INSERT INTO sources (id, tenant_id, project_id, name, mime_type)
     VALUES ($1, $2, $3, 'doc-alpha-p4.txt', 'text/plain') ON CONFLICT (id) DO NOTHING`,
    [SOURCE_A, TENANT_A, PROJECT_A],
  );
  await suPool.query(
    `INSERT INTO sources (id, tenant_id, project_id, name, mime_type)
     VALUES ($1, $2, $3, 'doc-beta-p4.txt', 'text/plain') ON CONFLICT (id) DO NOTHING`,
    [SOURCE_B, TENANT_B, PROJECT_B],
  );

  // Source versions
  await suPool.query(
    `INSERT INTO source_versions
       (id, source_id, tenant_id, sha256, size_bytes, storage_path, idempotency_key, status)
     VALUES ($1, $2, $3, $4, 100, $5, 'ikey-p4-a', 'INGESTED') ON CONFLICT (id) DO NOTHING`,
    [VERSION_A, SOURCE_A, TENANT_A, "a4".repeat(32), `${SOURCE_A}/${"a4".repeat(32)}`],
  );
  await suPool.query(
    `INSERT INTO source_versions
       (id, source_id, tenant_id, sha256, size_bytes, storage_path, idempotency_key, status)
     VALUES ($1, $2, $3, $4, 200, $5, 'ikey-p4-b', 'INGESTED') ON CONFLICT (id) DO NOTHING`,
    [VERSION_B, SOURCE_B, TENANT_B, "b4".repeat(32), `${SOURCE_B}/${"b4".repeat(32)}`],
  );

  // Source fragments (needed for citations)
  await suPool.query(
    `INSERT INTO source_fragments
       (id, version_id, tenant_id, ordinal, page, text, char_start, char_end, hash)
     VALUES ($1, $2, $3, 0, null, 'The study enrolled 240 patients between 2020 and 2022.', 0, 53, $4)
     ON CONFLICT (id) DO NOTHING`,
    [FRAGMENT_A, VERSION_A, TENANT_A, "f4".repeat(32)],
  );
  await suPool.query(
    `INSERT INTO source_fragments
       (id, version_id, tenant_id, ordinal, page, text, char_start, char_end, hash)
     VALUES ($1, $2, $3, 0, null, 'Beta trial showed 150 participants over 18 months.', 0, 50, $4)
     ON CONFLICT (id) DO NOTHING`,
    [FRAGMENT_B, VERSION_B, TENANT_B, "g4".repeat(32)],
  );

  // Evidence items
  await suPool.query(
    `INSERT INTO evidence_items (id, version_id, fragment_id, tenant_id, kind, text)
     VALUES ($1, $2, $3, $4, 'statement', 'The study enrolled 240 patients between 2020 and 2022.')
     ON CONFLICT (id) DO NOTHING`,
    [EVIDENCE_A, VERSION_A, FRAGMENT_A, TENANT_A],
  );
  await suPool.query(
    `INSERT INTO evidence_items (id, version_id, fragment_id, tenant_id, kind, text)
     VALUES ($1, $2, $3, $4, 'data_point', 'Beta trial showed 150 participants over 18 months.')
     ON CONFLICT (id) DO NOTHING`,
    [EVIDENCE_B, VERSION_B, FRAGMENT_B, TENANT_B],
  );

  // Seed one claim per tenant via superuser (for cross-tenant isolation tests)
  await suPool.query(
    `INSERT INTO claims
       (id, tenant_id, project_id, subject, predicate, object, claim_text,
        claim_type, support_status, negative_evidence_note, evidence_ids)
     VALUES ($1, $2, $3, 'population', 'size', '240',
             'Population size was 240.',
             'witnessed', 'supported',
             'No contradicting population counts found.',
             ARRAY[$4]::uuid[])
     ON CONFLICT (id) DO NOTHING`,
    [CLAIM_A, TENANT_A, PROJECT_A, EVIDENCE_A],
  );
  await suPool.query(
    `INSERT INTO claims
       (id, tenant_id, project_id, subject, predicate, object, claim_text,
        claim_type, support_status, evidence_ids)
     VALUES ($1, $2, $3, 'participants', 'count', '150',
             'Participant count was 150.',
             'inferred', 'weak',
             ARRAY[$4]::uuid[])
     ON CONFLICT (id) DO NOTHING`,
    [CLAIM_B, TENANT_B, PROJECT_B, EVIDENCE_B],
  );
});

afterAll(async () => {
  if (suPool) {
    // Delete in dependency order (children first)
    await suPool.query(
      "DELETE FROM claim_edges WHERE tenant_id = ANY($1)",
      [[TENANT_A, TENANT_B]],
    );
    await suPool.query(
      "DELETE FROM citations WHERE tenant_id = ANY($1)",
      [[TENANT_A, TENANT_B]],
    );
    await suPool.query(
      "DELETE FROM assumptions WHERE tenant_id = ANY($1)",
      [[TENANT_A, TENANT_B]],
    );
    await suPool.query(
      "DELETE FROM terminology_entries WHERE project_id = ANY($1)",
      [[PROJECT_A, PROJECT_B]],
    );
    await suPool.query(
      "DELETE FROM claims WHERE id = ANY($1)",
      [[CLAIM_A, CLAIM_B]],
    );
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
// claims — RLS live tests
// ================================================================
describeIf("RLS live — claims: Tenant A vs Tenant B isolation", () => {
  it("Tenant A context sees its own claim", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_A,
      "SELECT id FROM claims WHERE id = $1",
      [CLAIM_A],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(CLAIM_A);
  });

  it("Tenant B context sees its own claim", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_B,
      "SELECT id FROM claims WHERE id = $1",
      [CLAIM_B],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(CLAIM_B);
  });

  it("Tenant A context cannot read Tenant B claim", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_A,
      "SELECT id FROM claims WHERE id = $1",
      [CLAIM_B],
    );
    expect(rows).toHaveLength(0);
  });

  it("Tenant B context cannot read Tenant A claim", async () => {
    const rows = await queryAs<{ id: string }>(
      TENANT_B,
      "SELECT id FROM claims WHERE id = $1",
      [CLAIM_A],
    );
    expect(rows).toHaveLength(0);
  });

  it("missing tenant context returns no rows from claims — fail closed", async () => {
    const rows = await queryNoContext<{ id: string }>("SELECT id FROM claims");
    expect(rows).toHaveLength(0);
  });

  it("Tenant A cannot INSERT a claim into Tenant B (WITH CHECK rejects)", async () => {
    await expect(
      queryAs(
        TENANT_A,
        `INSERT INTO claims
           (tenant_id, project_id, subject, predicate, object, claim_text,
            claim_type, support_status)
         VALUES ($1, $2, 'x', 'y', 'z', 'x y z.', 'assumption', 'not_applicable')`,
        [TENANT_B, PROJECT_B],
      ),
    ).rejects.toThrow();
  });

  it("getClaim via app layer returns row for correct tenant", async () => {
    const row = await withAppTenant(TENANT_A, (client) =>
      getClaim(client, CLAIM_A),
    );
    expect(row).not.toBeNull();
    expect(row!.id).toBe(CLAIM_A);
    expect(row!.tenant_id).toBe(TENANT_A);
  });

  it("getClaim via app layer returns null when RLS excludes cross-tenant row", async () => {
    const row = await withAppTenant(TENANT_A, (client) =>
      getClaim(client, CLAIM_B),
    );
    expect(row).toBeNull();
  });

  it("insertClaim via app layer creates row visible to same tenant", async () => {
    const row = await withAppTenant(TENANT_A, (client) =>
      insertClaim(client, {
        tenantId:             TENANT_A,
        projectId:            PROJECT_A,
        subject:              "sample size",
        predicate:            "equals",
        object:               "80",
        claimText:            "Sample size equals 80.",
        claimType:            "inferred",
        supportStatus:        "weak",
        negativeEvidenceNote: "No conflicting sample size data found.",
        evidenceIds:          [EVIDENCE_A],
      }),
    );
    expect(row.tenant_id).toBe(TENANT_A);
    expect(row.subject).toBe("sample size");

    // Cleanup via superuser
    await suPool.query("DELETE FROM claims WHERE id = $1", [row.id]);
  });

  it("claims UPDATE within tenant is allowed (reviewer_status)", async () => {
    await queryAs(
      TENANT_A,
      "UPDATE claims SET reviewer_status = 'accepted' WHERE id = $1",
      [CLAIM_A],
    );
    const rows = await withTransaction(suPool, async (c: pg.PoolClient) => {
      const r = await c.query<{ reviewer_status: string }>(
        "SELECT reviewer_status FROM claims WHERE id = $1",
        [CLAIM_A],
      );
      return r.rows;
    });
    expect(rows[0]?.reviewer_status).toBe("accepted");

    // Reset
    await suPool.query(
      "UPDATE claims SET reviewer_status = 'pending' WHERE id = $1",
      [CLAIM_A],
    );
  });

  it("claims DELETE is silently blocked (no DELETE policy)", async () => {
    const before = await withTransaction(suPool, async (c: pg.PoolClient) => {
      const r = await c.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM claims WHERE id = $1",
        [CLAIM_A],
      );
      return Number(r.rows[0]?.count ?? "0");
    });
    expect(before).toBe(1);

    await queryAs(TENANT_A, "DELETE FROM claims WHERE id = $1", [CLAIM_A]);

    const after = await withTransaction(suPool, async (c: pg.PoolClient) => {
      const r = await c.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM claims WHERE id = $1",
        [CLAIM_A],
      );
      return Number(r.rows[0]?.count ?? "0");
    });
    expect(after).toBe(1);
  });
});

// ================================================================
// citations — RLS live tests
// ================================================================
describeIf("RLS live — citations: Tenant A vs Tenant B isolation", () => {
  it("insertCitation via app layer creates row visible to same tenant", async () => {
    const row = await withAppTenant(TENANT_A, (client) =>
      insertCitation(client, {
        tenantId:   TENANT_A,
        claimId:    CLAIM_A,
        evidenceId: EVIDENCE_A,
        fragmentId: FRAGMENT_A,
        status:     "supports_claim",
        quote:      "240 patients between 2020 and 2022",
        quoteHash:  "a".repeat(64),
      }),
    );
    expect(row.tenant_id).toBe(TENANT_A);
    expect(row.claim_id).toBe(CLAIM_A);
    expect(row.quote).toBe("240 patients between 2020 and 2022");

    // Cleanup
    await suPool.query("DELETE FROM citations WHERE id = $1", [row.id]);
  });

  it("Tenant A context cannot read Tenant B citation", async () => {
    // Insert a citation for Tenant B via superuser
    const res = await suPool.query<{ id: string }>(
      `INSERT INTO citations (tenant_id, claim_id, evidence_id, status)
       VALUES ($1, $2, $3, 'discovered') RETURNING id`,
      [TENANT_B, CLAIM_B, EVIDENCE_B],
    );
    const citBId = res.rows[0]!.id;

    const rows = await queryAs<{ id: string }>(
      TENANT_A,
      "SELECT id FROM citations WHERE id = $1",
      [citBId],
    );
    expect(rows).toHaveLength(0);

    await suPool.query("DELETE FROM citations WHERE id = $1", [citBId]);
  });

  it("missing tenant context returns no rows from citations — fail closed", async () => {
    // Seed one citation
    const res = await suPool.query<{ id: string }>(
      `INSERT INTO citations (tenant_id, claim_id, evidence_id, status)
       VALUES ($1, $2, $3, 'retrieved') RETURNING id`,
      [TENANT_A, CLAIM_A, EVIDENCE_A],
    );
    const citId = res.rows[0]!.id;

    const rows = await queryNoContext<{ id: string }>("SELECT id FROM citations");
    expect(rows).toHaveLength(0);

    await suPool.query("DELETE FROM citations WHERE id = $1", [citId]);
  });

  it("Tenant A cannot INSERT a citation into Tenant B (WITH CHECK rejects)", async () => {
    await expect(
      queryAs(
        TENANT_A,
        `INSERT INTO citations (tenant_id, claim_id, evidence_id, status)
         VALUES ($1, $2, $3, 'discovered')`,
        [TENANT_B, CLAIM_B, EVIDENCE_B],
      ),
    ).rejects.toThrow();
  });

  it("citations DELETE is silently blocked (no DELETE policy)", async () => {
    const res = await suPool.query<{ id: string }>(
      `INSERT INTO citations (tenant_id, claim_id, evidence_id, status)
       VALUES ($1, $2, $3, 'unverified') RETURNING id`,
      [TENANT_A, CLAIM_A, EVIDENCE_A],
    );
    const citId = res.rows[0]!.id;

    await queryAs(TENANT_A, "DELETE FROM citations WHERE id = $1", [citId]);

    const after = await withTransaction(suPool, async (c: pg.PoolClient) => {
      const r = await c.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM citations WHERE id = $1",
        [citId],
      );
      return Number(r.rows[0]?.count ?? "0");
    });
    expect(after).toBe(1);

    await suPool.query("DELETE FROM citations WHERE id = $1", [citId]);
  });
});

// ================================================================
// assumptions — RLS live tests
// ================================================================
describeIf("RLS live — assumptions: Tenant A vs Tenant B isolation", () => {
  it("insertAssumption via app layer creates row visible to same tenant", async () => {
    const row = await withAppTenant(TENANT_A, (client) =>
      insertAssumption(client, {
        tenantId:  TENANT_A,
        projectId: PROJECT_A,
        statement: "Randomisation was stratified by site.",
        rationale: "Protocol section 3 states stratified randomisation.",
      }),
    );
    expect(row.tenant_id).toBe(TENANT_A);
    expect(row.statement).toBe("Randomisation was stratified by site.");

    await suPool.query("DELETE FROM assumptions WHERE id = $1", [row.id]);
  });

  it("Tenant A context cannot read Tenant B assumption", async () => {
    const res = await suPool.query<{ id: string }>(
      `INSERT INTO assumptions (tenant_id, project_id, statement)
       VALUES ($1, $2, 'Beta assumption') RETURNING id`,
      [TENANT_B, PROJECT_B],
    );
    const asmBId = res.rows[0]!.id;

    const rows = await queryAs<{ id: string }>(
      TENANT_A,
      "SELECT id FROM assumptions WHERE id = $1",
      [asmBId],
    );
    expect(rows).toHaveLength(0);

    await suPool.query("DELETE FROM assumptions WHERE id = $1", [asmBId]);
  });

  it("missing tenant context returns no rows from assumptions — fail closed", async () => {
    const res = await suPool.query<{ id: string }>(
      `INSERT INTO assumptions (tenant_id, project_id, statement)
       VALUES ($1, $2, 'No-context assumption') RETURNING id`,
      [TENANT_A, PROJECT_A],
    );
    const asmId = res.rows[0]!.id;

    const rows = await queryNoContext<{ id: string }>("SELECT id FROM assumptions");
    expect(rows).toHaveLength(0);

    await suPool.query("DELETE FROM assumptions WHERE id = $1", [asmId]);
  });

  it("Tenant A cannot INSERT an assumption into Tenant B (WITH CHECK rejects)", async () => {
    await expect(
      queryAs(
        TENANT_A,
        `INSERT INTO assumptions (tenant_id, project_id, statement)
         VALUES ($1, $2, 'Cross-tenant assumption')`,
        [TENANT_B, PROJECT_B],
      ),
    ).rejects.toThrow();
  });
});

// ================================================================
// terminology_entries — RLS + uniqueness live tests
// ================================================================
describeIf("RLS live — terminology_entries: isolation and uniqueness", () => {
  it("insertTerminologyEntry via app layer creates row visible to same tenant", async () => {
    const row = await withAppTenant(TENANT_A, (client) =>
      insertTerminologyEntry(client, {
        tenantId:   TENANT_A,
        projectId:  PROJECT_A,
        term:       "RCT",
        definition: "Randomised Controlled Trial",
      }),
    );
    expect(row.tenant_id).toBe(TENANT_A);
    expect(row.term).toBe("RCT");

    await suPool.query(
      "DELETE FROM terminology_entries WHERE id = $1",
      [row.id],
    );
  });

  it("getTerminologyEntry returns the entry when it exists", async () => {
    await suPool.query(
      `INSERT INTO terminology_entries (tenant_id, project_id, term, definition)
       VALUES ($1, $2, 'ITT', 'Intention-To-Treat') ON CONFLICT (project_id, term) DO NOTHING`,
      [TENANT_A, PROJECT_A],
    );

    const result = await withAppTenant(TENANT_A, (client) =>
      getTerminologyEntry(client, PROJECT_A, "ITT"),
    );
    expect(result).not.toBeNull();
    expect(result!.term).toBe("ITT");
    expect(result!.definition).toBe("Intention-To-Treat");

    await suPool.query(
      "DELETE FROM terminology_entries WHERE project_id = $1 AND term = $2",
      [PROJECT_A, "ITT"],
    );
  });

  it("getTerminologyEntry returns null for term that does not exist", async () => {
    const result = await withAppTenant(TENANT_A, (client) =>
      getTerminologyEntry(client, PROJECT_A, "UnknownTerm"),
    );
    expect(result).toBeNull();
  });

  it("UNIQUE (project_id, term) constraint rejects duplicate term insertion", async () => {
    await suPool.query(
      `INSERT INTO terminology_entries (tenant_id, project_id, term, definition)
       VALUES ($1, $2, 'PP', 'Per Protocol') ON CONFLICT (project_id, term) DO NOTHING`,
      [TENANT_A, PROJECT_A],
    );

    // Second insert of same (project_id, term) must be rejected
    await expect(
      withAppTenant(TENANT_A, (client) =>
        insertTerminologyEntry(client, {
          tenantId:   TENANT_A,
          projectId:  PROJECT_A,
          term:       "PP",
          definition: "Duplicate definition attempt",
        }),
      ),
    ).rejects.toThrow();

    await suPool.query(
      "DELETE FROM terminology_entries WHERE project_id = $1 AND term = $2",
      [PROJECT_A, "PP"],
    );
  });

  it("Tenant A context cannot read Tenant B terminology entry", async () => {
    await suPool.query(
      `INSERT INTO terminology_entries (tenant_id, project_id, term, definition)
       VALUES ($1, $2, 'AE', 'Adverse Event') ON CONFLICT (project_id, term) DO NOTHING`,
      [TENANT_B, PROJECT_B],
    );

    const rows = await queryAs<{ term: string }>(
      TENANT_A,
      "SELECT term FROM terminology_entries WHERE project_id = $1 AND term = $2",
      [PROJECT_B, "AE"],
    );
    expect(rows).toHaveLength(0);

    await suPool.query(
      "DELETE FROM terminology_entries WHERE project_id = $1 AND term = $2",
      [PROJECT_B, "AE"],
    );
  });

  it("missing tenant context returns no rows from terminology_entries — fail closed", async () => {
    await suPool.query(
      `INSERT INTO terminology_entries (tenant_id, project_id, term, definition)
       VALUES ($1, $2, 'SAE', 'Serious Adverse Event') ON CONFLICT (project_id, term) DO NOTHING`,
      [TENANT_A, PROJECT_A],
    );

    const rows = await queryNoContext<{ term: string }>(
      "SELECT term FROM terminology_entries",
    );
    expect(rows).toHaveLength(0);

    await suPool.query(
      "DELETE FROM terminology_entries WHERE project_id = $1 AND term = $2",
      [PROJECT_A, "SAE"],
    );
  });

  it("Tenant A cannot INSERT a terminology entry into Tenant B (WITH CHECK rejects)", async () => {
    await expect(
      queryAs(
        TENANT_A,
        `INSERT INTO terminology_entries (tenant_id, project_id, term, definition)
         VALUES ($1, $2, 'CrossTerm', 'cross-tenant definition')`,
        [TENANT_B, PROJECT_B],
      ),
    ).rejects.toThrow();
  });

  it("same term in different projects does not violate uniqueness", async () => {
    const rowA = await withAppTenant(TENANT_A, (client) =>
      insertTerminologyEntry(client, {
        tenantId:   TENANT_A,
        projectId:  PROJECT_A,
        term:       "SHARED_TERM",
        definition: "Definition for Project A",
      }),
    );
    // Project B uses the same term name — allowed because the UNIQUE is (project_id, term)
    const rowB = await withAppTenant(TENANT_B, (client) =>
      insertTerminologyEntry(client, {
        tenantId:   TENANT_B,
        projectId:  PROJECT_B,
        term:       "SHARED_TERM",
        definition: "Definition for Project B",
      }),
    );
    expect(rowA.term).toBe("SHARED_TERM");
    expect(rowB.term).toBe("SHARED_TERM");
    expect(rowA.project_id).not.toBe(rowB.project_id);

    await suPool.query("DELETE FROM terminology_entries WHERE id = ANY($1)", [
      [rowA.id, rowB.id],
    ]);
  });
});

// ================================================================
// claim_edges — RLS live tests
// ================================================================
describeIf("RLS live — claim_edges: Tenant A vs Tenant B isolation", () => {
  it("insertClaimEdge via app layer creates row visible to same tenant", async () => {
    // Second claim for Tenant A — needed as edge target
    const targetRow = await withAppTenant(TENANT_A, (client) =>
      insertClaim(client, {
        tenantId:             TENANT_A,
        projectId:            PROJECT_A,
        subject:              "efficacy",
        predicate:            "measured_by",
        object:               "HbA1c",
        claimText:            "Efficacy measured by HbA1c.",
        claimType:            "inferred",
        supportStatus:        "weak",
        negativeEvidenceNote: "No alternative efficacy measure documented.",
      }),
    );

    const edgeRow = await withAppTenant(TENANT_A, (client) =>
      insertClaimEdge(client, {
        tenantId:      TENANT_A,
        sourceClaimId: CLAIM_A,
        targetClaimId: targetRow.id,
        edgeType:      "SUPPORTS",
      }),
    );
    expect(edgeRow.tenant_id).toBe(TENANT_A);
    expect(edgeRow.edge_type).toBe("SUPPORTS");

    // Cleanup
    await suPool.query("DELETE FROM claim_edges WHERE id = $1", [edgeRow.id]);
    await suPool.query("DELETE FROM claims WHERE id = $1", [targetRow.id]);
  });

  it("getClaimEdges returns edges for source claim within tenant context", async () => {
    // Create target claim and edge via superuser
    const claimRes = await suPool.query<{ id: string }>(
      `INSERT INTO claims
         (tenant_id, project_id, subject, predicate, object, claim_text,
          claim_type, support_status)
       VALUES ($1, $2, 'follow-up', 'duration', '12 months',
               'Follow-up duration was 12 months.',
               'assumption', 'not_applicable')
       RETURNING id`,
      [TENANT_A, PROJECT_A],
    );
    const targetId = claimRes.rows[0]!.id;

    const edgeRes = await suPool.query<{ id: string }>(
      `INSERT INTO claim_edges (tenant_id, source_claim_id, target_claim_id, edge_type)
       VALUES ($1, $2, $3, 'DERIVED_FROM') RETURNING id`,
      [TENANT_A, CLAIM_A, targetId],
    );
    const edgeId = edgeRes.rows[0]!.id;

    const edges = await withAppTenant(TENANT_A, (client) =>
      getClaimEdges(client, CLAIM_A),
    );
    expect(edges.some((e) => e.id === edgeId)).toBe(true);

    // Cleanup
    await suPool.query("DELETE FROM claim_edges WHERE id = $1", [edgeId]);
    await suPool.query("DELETE FROM claims WHERE id = $1", [targetId]);
  });

  it("Tenant A context cannot read Tenant B claim edges", async () => {
    // Create a second claim for Tenant B and an edge between B claims
    const claimBRes = await suPool.query<{ id: string }>(
      `INSERT INTO claims
         (tenant_id, project_id, subject, predicate, object, claim_text,
          claim_type, support_status)
       VALUES ($1, $2, 'safety', 'rate', 'low',
               'Safety rate was low.',
               'inferred', 'weak')
       RETURNING id`,
      [TENANT_B, PROJECT_B],
    );
    const claimB2 = claimBRes.rows[0]!.id;

    const edgeRes = await suPool.query<{ id: string }>(
      `INSERT INTO claim_edges (tenant_id, source_claim_id, target_claim_id, edge_type)
       VALUES ($1, $2, $3, 'CONTRADICTS') RETURNING id`,
      [TENANT_B, CLAIM_B, claimB2],
    );
    const edgeBId = edgeRes.rows[0]!.id;

    const rows = await queryAs<{ id: string }>(
      TENANT_A,
      "SELECT id FROM claim_edges WHERE id = $1",
      [edgeBId],
    );
    expect(rows).toHaveLength(0);

    // Cleanup
    await suPool.query("DELETE FROM claim_edges WHERE id = $1", [edgeBId]);
    await suPool.query("DELETE FROM claims WHERE id = $1", [claimB2]);
  });

  it("missing tenant context returns no rows from claim_edges — fail closed", async () => {
    // Seed an edge
    const claimRes = await suPool.query<{ id: string }>(
      `INSERT INTO claims
         (tenant_id, project_id, subject, predicate, object, claim_text,
          claim_type, support_status)
       VALUES ($1, $2, 'dropout', 'rate', '5%',
               'Dropout rate was 5%.', 'witnessed', 'unsupported')
       RETURNING id`,
      [TENANT_A, PROJECT_A],
    );
    const targetId = claimRes.rows[0]!.id;

    const edgeRes = await suPool.query<{ id: string }>(
      `INSERT INTO claim_edges (tenant_id, source_claim_id, target_claim_id, edge_type)
       VALUES ($1, $2, $3, 'SUPPORTS') RETURNING id`,
      [TENANT_A, CLAIM_A, targetId],
    );
    const edgeId = edgeRes.rows[0]!.id;

    const rows = await queryNoContext<{ id: string }>("SELECT id FROM claim_edges");
    expect(rows).toHaveLength(0);

    // Cleanup
    await suPool.query("DELETE FROM claim_edges WHERE id = $1", [edgeId]);
    await suPool.query("DELETE FROM claims WHERE id = $1", [targetId]);
  });

  it("UNIQUE (source_claim_id, target_claim_id, edge_type) rejects duplicate edge", async () => {
    const claimRes = await suPool.query<{ id: string }>(
      `INSERT INTO claims
         (tenant_id, project_id, subject, predicate, object, claim_text,
          claim_type, support_status)
       VALUES ($1, $2, 'mortality', 'rate', '2%',
               'Mortality rate was 2%.', 'inferred', 'unsupported')
       RETURNING id`,
      [TENANT_A, PROJECT_A],
    );
    const targetId = claimRes.rows[0]!.id;

    const edgeRes = await suPool.query<{ id: string }>(
      `INSERT INTO claim_edges (tenant_id, source_claim_id, target_claim_id, edge_type)
       VALUES ($1, $2, $3, 'SUPPORTS') RETURNING id`,
      [TENANT_A, CLAIM_A, targetId],
    );
    const edgeId = edgeRes.rows[0]!.id;

    // Duplicate insert must fail
    await expect(
      withAppTenant(TENANT_A, (client) =>
        insertClaimEdge(client, {
          tenantId:      TENANT_A,
          sourceClaimId: CLAIM_A,
          targetClaimId: targetId,
          edgeType:      "SUPPORTS",
        }),
      ),
    ).rejects.toThrow();

    // Cleanup
    await suPool.query("DELETE FROM claim_edges WHERE id = $1", [edgeId]);
    await suPool.query("DELETE FROM claims WHERE id = $1", [targetId]);
  });

  it("Tenant A cannot INSERT a claim edge into Tenant B (WITH CHECK rejects)", async () => {
    await expect(
      queryAs(
        TENANT_A,
        `INSERT INTO claim_edges (tenant_id, source_claim_id, target_claim_id, edge_type)
         VALUES ($1, $2, $3, 'SUPPORTS')`,
        [TENANT_B, CLAIM_B, CLAIM_B],
      ),
    ).rejects.toThrow();
  });

  it("claim_edges DELETE is silently blocked (no DELETE policy)", async () => {
    const claimRes = await suPool.query<{ id: string }>(
      `INSERT INTO claims
         (tenant_id, project_id, subject, predicate, object, claim_text,
          claim_type, support_status)
       VALUES ($1, $2, 'incidence', 'rate', 'low',
               'Incidence rate was low.', 'assumption', 'not_applicable')
       RETURNING id`,
      [TENANT_A, PROJECT_A],
    );
    const targetId = claimRes.rows[0]!.id;

    const edgeRes = await suPool.query<{ id: string }>(
      `INSERT INTO claim_edges (tenant_id, source_claim_id, target_claim_id, edge_type)
       VALUES ($1, $2, $3, 'DERIVED_FROM') RETURNING id`,
      [TENANT_A, CLAIM_A, targetId],
    );
    const edgeId = edgeRes.rows[0]!.id;

    await queryAs(TENANT_A, "DELETE FROM claim_edges WHERE id = $1", [edgeId]);

    const after = await withTransaction(suPool, async (c: pg.PoolClient) => {
      const r = await c.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM claim_edges WHERE id = $1",
        [edgeId],
      );
      return Number(r.rows[0]?.count ?? "0");
    });
    expect(after).toBe(1);

    // Cleanup
    await suPool.query("DELETE FROM claim_edges WHERE id = $1", [edgeId]);
    await suPool.query("DELETE FROM claims WHERE id = $1", [targetId]);
  });
});
