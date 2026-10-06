/**
 * Unit tests for packages/db/src/sources.ts
 * Covers: immutability constraints, idempotency, tenant isolation, extraction status.
 * No live database required — uses mock PoolClient.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  insertSource,
  upsertSourceVersion,
  setVersionStatus,
  insertSourceFragments,
  getSourceVersion,
} from "../src/sources.js";
import type { SourceRow, SourceVersionRow } from "../src/sources.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(__dirname, "../migrations/002_sources_fragments.sql");

// ============================================================
// Mock client
// ============================================================

interface MockQuery {
  text:   string;
  values: unknown[];
}

interface MockClientResult {
  rows: unknown[];
  rowCount: number;
}

function makeMockClient(
  rowFactory?: (text: string, values: unknown[]) => unknown[],
): { client: Parameters<typeof insertSource>[0]; queries: MockQuery[] } {
  const queries: MockQuery[] = [];
  const client = {
    query: async (text: string, values?: unknown[]): Promise<MockClientResult> => {
      const vals = values ?? [];
      queries.push({ text, values: vals });
      const rows = rowFactory ? rowFactory(text, vals) : [];
      return { rows, rowCount: rows.length };
    },
  } as unknown as Parameters<typeof insertSource>[0];
  return { client, queries };
}

// ============================================================
// Fixture data
// ============================================================

const TENANT_A = "aaaaaaaa-0000-4000-a000-000000000001";
const TENANT_B = "bbbbbbbb-0000-4000-b000-000000000002";
const PROJECT_ID = "cccccccc-0000-4000-c000-000000000001";
const SOURCE_ID = "dddddddd-0000-4000-d000-000000000001";
const VERSION_ID = "eeeeeeee-0000-4000-e000-000000000001";

function makeSourceRow(): SourceRow {
  return {
    id:         SOURCE_ID,
    tenant_id:  TENANT_A,
    project_id: PROJECT_ID,
    name:       "test-doc.txt",
    mime_type:  "text/plain",
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function makeVersionRow(status = "INGESTED"): SourceVersionRow {
  return {
    id:               VERSION_ID,
    source_id:        SOURCE_ID,
    tenant_id:        TENANT_A,
    sha256:           "a".repeat(64),
    size_bytes:       "1024",
    storage_path:     `${SOURCE_ID}/${"a".repeat(64)}`,
    idempotency_key:  "key-001",
    status:           status as "INGESTED" | "EXTRACTED" | "FAILED_TERMINAL",
    fail_reason:      null,
    created_at:       new Date(),
  };
}

// ============================================================
// insertSource
// ============================================================

describe("insertSource", () => {
  it("issues an INSERT into sources with correct fields", async () => {
    const expectedRow = makeSourceRow();
    const { client, queries } = makeMockClient(() => [expectedRow]);

    const row = await insertSource(client, {
      tenantId:  TENANT_A,
      projectId: PROJECT_ID,
      name:      "test-doc.txt",
      mimeType:  "text/plain",
    });

    expect(queries).toHaveLength(1);
    expect(queries[0]?.text).toContain("INSERT INTO sources");
    expect(queries[0]?.values).toContain(TENANT_A);
    expect(queries[0]?.values).toContain(PROJECT_ID);
    expect(queries[0]?.values).toContain("text/plain");
    expect(row.id).toBe(SOURCE_ID);
  });
});

// ============================================================
// upsertSourceVersion — idempotency
// ============================================================

describe("upsertSourceVersion — idempotency", () => {
  it("returns deduplicated=false when no existing version is found", async () => {
    // First SELECT returns no rows; INSERT returns the version row
    let callCount = 0;
    const { client } = makeMockClient((_text) => {
      callCount++;
      if (callCount === 1) {
        // SELECT for idempotency check — no rows
        return [];
      }
      // INSERT — return the version row
      return [makeVersionRow()];
    });

    const { row, deduplicated } = await upsertSourceVersion(client, {
      sourceId:       SOURCE_ID,
      tenantId:       TENANT_A,
      sha256:         "a".repeat(64),
      sizeBytes:      1024,
      storagePath:    `${SOURCE_ID}/${"a".repeat(64)}`,
      idempotencyKey: "key-001",
    });

    expect(deduplicated).toBe(false);
    expect(row.id).toBe(VERSION_ID);
  });

  it("returns deduplicated=true when the idempotency key already exists", async () => {
    // The SELECT returns the existing version row
    const { client, queries } = makeMockClient(() => [makeVersionRow()]);

    const { row, deduplicated } = await upsertSourceVersion(client, {
      sourceId:       SOURCE_ID,
      tenantId:       TENANT_A,
      sha256:         "a".repeat(64),
      sizeBytes:      1024,
      storagePath:    `${SOURCE_ID}/${"a".repeat(64)}`,
      idempotencyKey: "key-001",
    });

    expect(deduplicated).toBe(true);
    expect(row.id).toBe(VERSION_ID);
    // Only the SELECT was issued — no INSERT
    expect(queries).toHaveLength(1);
    expect(queries[0]?.text).toContain("SELECT");
    expect(queries[0]?.text).not.toContain("INSERT");
  });

  it("does not issue an INSERT when the idempotency key matches", async () => {
    const { client, queries } = makeMockClient(() => [makeVersionRow()]);

    await upsertSourceVersion(client, {
      sourceId:       SOURCE_ID,
      tenantId:       TENANT_A,
      sha256:         "b".repeat(64),
      sizeBytes:      2048,
      storagePath:    `${SOURCE_ID}/${"b".repeat(64)}`,
      idempotencyKey: "key-001",
    });

    const insertQuery = queries.find((q) => q.text.includes("INSERT"));
    expect(insertQuery).toBeUndefined();
  });
});

// ============================================================
// Immutability: migration SQL has no DELETE policy on source_versions
// ============================================================

describe("source_versions immutability (migration SQL)", () => {
  it("does NOT create a DELETE policy for source_versions", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).not.toMatch(/CREATE POLICY[^;]+ON source_versions\s*\n\s*FOR DELETE/);
  });

  it("creates only SELECT and INSERT and UPDATE-status policies for source_versions", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    // Verify the SELECT policy exists
    expect(sql).toMatch(/sv_select ON source_versions/);
    // Verify the INSERT policy exists
    expect(sql).toMatch(/sv_insert ON source_versions/);
    // The only UPDATE policy is the status update
    expect(sql).toMatch(/sv_update_status ON source_versions/);
  });

  it("does NOT create a DELETE policy for source_fragments", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).not.toMatch(/CREATE POLICY[^;]+ON source_fragments\s*\n\s*FOR DELETE/);
  });

  it("enables FORCE ROW LEVEL SECURITY on source_versions", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY[\s\S]*?source_versions/);
  });

  it("enables FORCE ROW LEVEL SECURITY on source_fragments", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY[\s\S]*?source_fragments/);
  });
});

// ============================================================
// setVersionStatus
// ============================================================

describe("setVersionStatus", () => {
  it("issues an UPDATE with EXTRACTED status", async () => {
    const { client, queries } = makeMockClient(() => []);
    await setVersionStatus(client, VERSION_ID, "EXTRACTED");

    expect(queries).toHaveLength(1);
    expect(queries[0]?.text).toContain("UPDATE source_versions");
    expect(queries[0]?.values).toContain("EXTRACTED");
    expect(queries[0]?.values).toContain(VERSION_ID);
  });

  it("issues an UPDATE with FAILED_TERMINAL status and fail_reason", async () => {
    const { client, queries } = makeMockClient(() => []);
    await setVersionStatus(client, VERSION_ID, "FAILED_TERMINAL", "PDF is image-only");

    expect(queries[0]?.values).toContain("FAILED_TERMINAL");
    expect(queries[0]?.values).toContain("PDF is image-only");
  });

  it("sets fail_reason to null when not provided", async () => {
    const { client, queries } = makeMockClient(() => []);
    await setVersionStatus(client, VERSION_ID, "EXTRACTED");

    // Second value is the fail_reason — should be null
    expect(queries[0]?.values?.[1]).toBeNull();
  });
});

// ============================================================
// Failed extraction does not become EXTRACTED
// ============================================================

describe("failed extraction state invariant", () => {
  it("FAILED_TERMINAL version has fail_reason present in the DB call", async () => {
    const { client, queries } = makeMockClient(() => []);
    const failReason = "PDF text extraction failed. The file may be encrypted.";
    await setVersionStatus(client, VERSION_ID, "FAILED_TERMINAL", failReason);

    const q = queries[0]!;
    expect(q.values).toContain("FAILED_TERMINAL");
    expect(q.values).toContain(failReason);
    // Ensure EXTRACTED is not also in the query values
    expect(q.values).not.toContain("EXTRACTED");
  });
});

// ============================================================
// Tenant isolation: SELECT query is tenant-scoped
// ============================================================

describe("getSourceVersion — tenant isolation", () => {
  it("SELECT query includes the version_id constraint (RLS enforces tenant)", async () => {
    const { client, queries } = makeMockClient(() => [makeVersionRow()]);
    await getSourceVersion(client, VERSION_ID);

    expect(queries).toHaveLength(1);
    expect(queries[0]?.text).toContain("WHERE id = $1");
    expect(queries[0]?.values).toContain(VERSION_ID);
    // Tenant isolation is enforced by RLS (not by an explicit WHERE tenant_id clause)
    // The test verifies the SELECT is parameterised and does not embed raw values
  });

  it("returns null when no row matches (simulates RLS exclusion for wrong tenant)", async () => {
    const { client } = makeMockClient(() => []); // No rows returned — RLS excluded them
    const result = await getSourceVersion(client, VERSION_ID);
    expect(result).toBeNull();
  });
});

// ============================================================
// insertSourceFragments
// ============================================================

describe("insertSourceFragments", () => {
  it("inserts a fragment row for each TextFragment", async () => {
    const frags = [
      {
        ordinal: 0, page: null, text: "Hello world",
        charStart: 0, charEnd: 11, hash: "h".repeat(64),
      },
      {
        ordinal: 1, page: null, text: "Second paragraph",
        charStart: 13, charEnd: 29, hash: "i".repeat(64),
      },
    ];

    const { client, queries } = makeMockClient(() => [
      {
        id: "ff000000-0000-4000-f000-000000000001",
        version_id: VERSION_ID,
        tenant_id: TENANT_A,
        ordinal: 0,
        page: null,
        text: "Hello world",
        char_start: 0,
        char_end: 11,
        hash: "h".repeat(64),
        created_at: new Date(),
      },
    ]);

    const rows = await insertSourceFragments(client, VERSION_ID, TENANT_A, frags);
    // Two INSERT queries — one per fragment
    expect(queries).toHaveLength(2);
    expect(queries[0]?.text).toContain("INSERT INTO source_fragments");
    expect(queries[0]?.values).toContain(VERSION_ID);
    expect(queries[0]?.values).toContain(TENANT_A);
    expect(rows).toHaveLength(2);
  });

  it("returns empty array when fragments list is empty", async () => {
    const { client, queries } = makeMockClient(() => []);
    const rows = await insertSourceFragments(client, VERSION_ID, TENANT_A, []);

    expect(rows).toHaveLength(0);
    expect(queries).toHaveLength(0);
  });
});

// ============================================================
// Cross-tenant isolation contract: versions not visible across tenants
// ============================================================

describe("cross-tenant isolation (RLS contract)", () => {
  it("getSourceVersion returns null when RLS excludes the row (wrong tenant context)", async () => {
    // Simulate: Tenant B's context — RLS returns no rows for Tenant A's version
    const { client } = makeMockClient(() => []); // empty = RLS excluded
    const result = await getSourceVersion(client, VERSION_ID);
    expect(result).toBeNull();
  });

  it("upsertSourceVersion includes tenant_id in INSERT VALUES to satisfy RLS WITH CHECK", async () => {
    let callCount = 0;
    const { client, queries } = makeMockClient(() => {
      callCount++;
      return callCount === 1 ? [] : [makeVersionRow()];
    });

    await upsertSourceVersion(client, {
      sourceId:       SOURCE_ID,
      tenantId:       TENANT_A,
      sha256:         "c".repeat(64),
      sizeBytes:      512,
      storagePath:    `${SOURCE_ID}/${"c".repeat(64)}`,
      idempotencyKey: "key-002",
    });

    const insertQuery = queries.find((q) => q.text.includes("INSERT"));
    expect(insertQuery).toBeDefined();
    expect(insertQuery?.values).toContain(TENANT_A);
    // Tenant B's ID must NOT appear in the INSERT
    expect(insertQuery?.values).not.toContain(TENANT_B);
  });
});
