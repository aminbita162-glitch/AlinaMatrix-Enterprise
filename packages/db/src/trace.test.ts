/**
 * Unit tests for packages/db/src/trace.ts — code-to-document trace (Phase D Unit 3).
 *
 * Uses a mock pg client (no live database required).
 * Also inspects migration 013 SQL for structural correctness.
 *
 * Covers:
 *   - insertTrace inserts (append-only); only INSERT, no UPDATE.
 *   - listTracesByClaim queries by claim_id.
 *   - listTracesByArtifact queries by artifact_id.
 *   - findTraceByPathAndClaim queries by cited_path + claim_id.
 *   - Migration 013 SQL: table, RLS, immutability triggers, GRANT, registry.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  insertTrace,
  listTracesByClaim,
  listTracesByArtifact,
  findTraceByPathAndClaim,
} from "./trace.js";
import type { TraceRow } from "./trace.js";
import type { DbClient } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(__dirname, "../migrations/013_code_to_document_traces.sql");

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

const TENANT_A    = "aaaaaaaa-0000-4000-a000-000000000001";
const CLAIM_ID    = "cccccccc-0000-4000-c000-000000000001";
const ARTIFACT_ID = "dddddddd-0000-4000-d000-000000000001";
const NOW = new Date("2026-10-06T12:00:00.000Z");

function makeTraceRow(overrides: Partial<TraceRow> = {}): TraceRow {
  return {
    id:           "33333333-0000-4000-t000-000000000003",
    tenant_id:    TENANT_A,
    cited_path:   "docs/architecture.md",
    claim_id:     CLAIM_ID,
    artifact_id:  ARTIFACT_ID,
    section:       "System Overview",
    created_at:    NOW,
    ...overrides,
  };
}

// ===========================================================================
// Migration 013 SQL structural tests
// ===========================================================================

describe("migration 013 SQL structural checks", () => {
  let sql = "";

  it("migration file can be read", async () => {
    sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql.length).toBeGreaterThan(200);
  });

  it("creates code_to_document_traces table", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("CREATE TABLE code_to_document_traces");
  });

  it("has immutability triggers (no update, no delete)", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("code_to_document_traces_immutable");
    expect(sql).toContain("BEFORE UPDATE ON code_to_document_traces");
    expect(sql).toContain("BEFORE DELETE ON code_to_document_traces");
  });

  it("GRANT excludes UPDATE and DELETE (append-only)", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    const grantLines = sql.split("\n").filter(
      (l) => l.includes("GRANT") && l.includes("code_to_document_traces"),
    );
    for (const line of grantLines) {
      expect(line).not.toContain("UPDATE");
      expect(line).not.toContain("DELETE");
    }
  });

  it("RLS enabled and forced on code_to_document_traces", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("ALTER TABLE code_to_document_traces ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE code_to_document_traces FORCE  ROW LEVEL SECURITY");
    expect(sql).toContain("code_to_document_traces_tenant");
  });

  it("has cited_path, claim_id, artifact_id, section columns", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("cited_path");
    expect(sql).toContain("claim_id");
    expect(sql).toContain("artifact_id");
    expect(sql).toContain("section");
  });

  it("migration registry entry present", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("INSERT INTO schema_migrations");
    expect(sql).toContain("013_code_to_document_traces");
  });
});

// ===========================================================================
// insertTrace (append-only — INSERT only)
// ===========================================================================

describe("insertTrace", () => {
  it("inserts a trace row and returns it", async () => {
    const expected = makeTraceRow();
    const { client } = makeMockClient([expected]);
    const result = await insertTrace(client, {
      tenantId:   TENANT_A,
      citedPath:  "docs/architecture.md",
      claimId:    CLAIM_ID,
      artifactId: ARTIFACT_ID,
      section:     "System Overview",
    });
    expect(result).toBe(expected);
  });

  it("only issues an INSERT (no UPDATE)", async () => {
    const { client, calls } = makeMockClient([makeTraceRow()]);
    await insertTrace(client, {
      tenantId:   TENANT_A,
      citedPath:  "docs/architecture.md",
      claimId:    CLAIM_ID,
      artifactId: ARTIFACT_ID,
      section:     "System Overview",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain("INSERT INTO code_to_document_traces");
    expect(calls[0]?.text).not.toContain("UPDATE");
  });

  it("stores the section as the 6th parameter", async () => {
    const { client, calls } = makeMockClient([makeTraceRow()]);
    await insertTrace(client, {
      tenantId:   TENANT_A,
      citedPath:  "docs/architecture.md",
      claimId:    CLAIM_ID,
      artifactId: ARTIFACT_ID,
      section:     "System Overview",
    });
    expect(calls[0]?.values[5]).toBe("System Overview");
  });
});

// ===========================================================================
// listTracesByClaim
// ===========================================================================

describe("listTracesByClaim", () => {
  it("returns all traces for a claim in order", async () => {
    const rows = [makeTraceRow(), makeTraceRow({ cited_path: "docs/other.md" })];
    const { client } = makeMockClient(rows);
    const result = await listTracesByClaim(client, CLAIM_ID);
    expect(result).toHaveLength(2);
  });

  it("queries by claim_id", async () => {
    const { client, calls } = makeMockClient([]);
    await listTracesByClaim(client, CLAIM_ID);
    expect(calls[0]?.text).toContain("WHERE claim_id = $1");
    expect(calls[0]?.values[0]).toBe(CLAIM_ID);
  });

  it("returns empty array when no traces", async () => {
    const { client } = makeMockClient([]);
    const result = await listTracesByClaim(client, CLAIM_ID);
    expect(result).toHaveLength(0);
  });
});

// ===========================================================================
// listTracesByArtifact
// ===========================================================================

describe("listTracesByArtifact", () => {
  it("queries by artifact_id", async () => {
    const { client, calls } = makeMockClient([]);
    await listTracesByArtifact(client, ARTIFACT_ID);
    expect(calls[0]?.text).toContain("WHERE artifact_id = $1");
    expect(calls[0]?.values[0]).toBe(ARTIFACT_ID);
  });
});

// ===========================================================================
// findTraceByPathAndClaim
// ===========================================================================

describe("findTraceByPathAndClaim", () => {
  it("returns the matching trace", async () => {
    const row = makeTraceRow();
    const { client } = makeMockClient([row]);
    const result = await findTraceByPathAndClaim(client, "docs/architecture.md", CLAIM_ID);
    expect(result).toBe(row);
  });

  it("returns null when no match", async () => {
    const { client } = makeMockClient([]);
    const result = await findTraceByPathAndClaim(client, "docs/architecture.md", CLAIM_ID);
    expect(result).toBeNull();
  });

  it("queries by cited_path and claim_id", async () => {
    const { client, calls } = makeMockClient([]);
    await findTraceByPathAndClaim(client, "docs/architecture.md", CLAIM_ID);
    expect(calls[0]?.text).toContain("cited_path = $1");
    expect(calls[0]?.text).toContain("claim_id = $2");
    expect(calls[0]?.values[0]).toBe("docs/architecture.md");
    expect(calls[0]?.values[1]).toBe(CLAIM_ID);
  });
});

// ===========================================================================
// Tenant isolation contract
// ===========================================================================

describe("tenant isolation — DB layer contract", () => {
  it("insertTrace passes tenant_id as the second parameter", async () => {
    const { client, calls } = makeMockClient([makeTraceRow()]);
    await insertTrace(client, {
      tenantId:   TENANT_A,
      citedPath:  "docs/architecture.md",
      claimId:    CLAIM_ID,
      artifactId: ARTIFACT_ID,
      section:     "System Overview",
    });
    expect(calls[0]?.values[1]).toBe(TENANT_A);
  });
});
