/**
 * Unit tests for packages/db/src/provenance.ts — provenance ledger (Phase D Unit 1).
 *
 * Uses a mock pg client (no live database required).
 * Also inspects migration 012 SQL for structural correctness.
 *
 * Covers:
 *   - insertProvenanceLedgerEntry inserts (append-only); only INSERT, no UPDATE.
 *   - listProvenanceLedgerByArtifact queries by artifact_id, ordered by sequence.
 *   - getProvenanceLedgerRoot returns the latest sequence entry.
 *   - Migration 012 SQL: table, RLS, immutability triggers, GRANT, registry.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  insertProvenanceLedgerEntry,
  listProvenanceLedgerByArtifact,
  getProvenanceLedgerRoot,
} from "./provenance.js";
import type { ProvenanceLedgerRow } from "./provenance.js";
import type { DbClient } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(__dirname, "../migrations/012_provenance_ledger.sql");

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
const ARTIFACT_ID = "dddddddd-0000-4000-d000-000000000001";
const SOURCE_VER  = "eeeeeeee-0000-4000-e000-000000000001";
const NOW = new Date("2026-10-06T12:00:00.000Z");

function makeLedgerRow(overrides: Partial<ProvenanceLedgerRow> = {}): ProvenanceLedgerRow {
  return {
    id:                  "33333333-0000-4000-p000-000000000003",
    tenant_id:           TENANT_A,
    artifact_id:         ARTIFACT_ID,
    source_version_id:   SOURCE_VER,
    content_hash:        "a".repeat(64),
    manifest_sha256:     "b".repeat(64),
    html_sha256:         "c".repeat(64),
    leaf_hash:           "d".repeat(64),
    ledger_root:         "e".repeat(64),
    sequence:            1,
    created_at:          NOW,
    ...overrides,
  };
}

// ===========================================================================
// Migration 012 SQL structural tests
// ===========================================================================

describe("migration 012 SQL structural checks", () => {
  let sql = "";

  it("migration file can be read", async () => {
    sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql.length).toBeGreaterThan(200);
  });

  it("creates provenance_ledger table", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("CREATE TABLE provenance_ledger");
  });

  it("has immutability triggers (no update, no delete)", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("provenance_ledger_immutable");
    expect(sql).toContain("BEFORE UPDATE ON provenance_ledger");
    expect(sql).toContain("BEFORE DELETE ON provenance_ledger");
  });

  it("GRANT excludes UPDATE and DELETE (append-only)", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    const grantLines = sql.split("\n").filter(
      (l) => l.includes("GRANT") && l.includes("provenance_ledger"),
    );
    for (const line of grantLines) {
      expect(line).not.toContain("UPDATE");
      expect(line).not.toContain("DELETE");
    }
  });

  it("RLS enabled and forced on provenance_ledger", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("ALTER TABLE provenance_ledger ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE provenance_ledger FORCE  ROW LEVEL SECURITY");
    expect(sql).toContain("provenance_ledger_tenant");
  });

  it("has the four leaf fields (source version, content hash, manifest, html sha256)", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("source_version_id");
    expect(sql).toContain("content_hash");
    expect(sql).toContain("manifest_sha256");
    expect(sql).toContain("html_sha256");
  });

  it("has leaf_hash and ledger_root columns", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("leaf_hash");
    expect(sql).toContain("ledger_root");
  });

  it("migration registry entry present", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("INSERT INTO schema_migrations");
    expect(sql).toContain("012_provenance_ledger");
  });
});

// ===========================================================================
// insertProvenanceLedgerEntry (append-only — INSERT only)
// ===========================================================================

describe("insertProvenanceLedgerEntry", () => {
  it("inserts a ledger row and returns it", async () => {
    const expected = makeLedgerRow();
    const { client } = makeMockClient([expected]);
    const result = await insertProvenanceLedgerEntry(client, {
      tenantId:         TENANT_A,
      artifactId:       ARTIFACT_ID,
      sourceVersionId:  SOURCE_VER,
      contentHash:      "a".repeat(64),
      manifestSha256:   "b".repeat(64),
      htmlSha256:        "c".repeat(64),
      leafHash:          "d".repeat(64),
      ledgerRoot:        "e".repeat(64),
      sequence:          1,
    });
    expect(result).toBe(expected);
  });

  it("only issues an INSERT (no UPDATE)", async () => {
    const { client, calls } = makeMockClient([makeLedgerRow()]);
    await insertProvenanceLedgerEntry(client, {
      tenantId:         TENANT_A,
      artifactId:       ARTIFACT_ID,
      sourceVersionId:  SOURCE_VER,
      contentHash:      "a".repeat(64),
      manifestSha256:   "b".repeat(64),
      htmlSha256:        "c".repeat(64),
      leafHash:          "d".repeat(64),
      ledgerRoot:        "e".repeat(64),
      sequence:          1,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain("INSERT INTO provenance_ledger");
    expect(calls[0]?.text).not.toContain("UPDATE");
  });

  it("stores the sequence as the 10th parameter", async () => {
    const { client, calls } = makeMockClient([makeLedgerRow()]);
    await insertProvenanceLedgerEntry(client, {
      tenantId:         TENANT_A,
      artifactId:       ARTIFACT_ID,
      sourceVersionId:  SOURCE_VER,
      contentHash:      "a".repeat(64),
      manifestSha256:   "b".repeat(64),
      htmlSha256:        "c".repeat(64),
      leafHash:          "d".repeat(64),
      ledgerRoot:        "e".repeat(64),
      sequence:          7,
    });
    expect(calls[0]?.values[9]).toBe(7);
  });
});

// ===========================================================================
// listProvenanceLedgerByArtifact
// ===========================================================================

describe("listProvenanceLedgerByArtifact", () => {
  it("returns all ledger rows for an artifact in sequence order", async () => {
    const rows = [
      makeLedgerRow({ sequence: 1 }),
      makeLedgerRow({ sequence: 2, leaf_hash: "f".repeat(64) }),
    ];
    const { client } = makeMockClient(rows);
    const result = await listProvenanceLedgerByArtifact(client, ARTIFACT_ID);
    expect(result).toHaveLength(2);
  });

  it("queries by artifact_id ordered by sequence ASC", async () => {
    const { client, calls } = makeMockClient([]);
    await listProvenanceLedgerByArtifact(client, ARTIFACT_ID);
    expect(calls[0]?.text).toContain("WHERE artifact_id = $1");
    expect(calls[0]?.text).toContain("ORDER BY sequence ASC");
    expect(calls[0]?.values[0]).toBe(ARTIFACT_ID);
  });

  it("returns empty array when no ledger rows", async () => {
    const { client } = makeMockClient([]);
    const result = await listProvenanceLedgerByArtifact(client, ARTIFACT_ID);
    expect(result).toHaveLength(0);
  });
});

// ===========================================================================
// getProvenanceLedgerRoot
// ===========================================================================

describe("getProvenanceLedgerRoot", () => {
  it("returns the latest sequence entry", async () => {
    const row = makeLedgerRow({ sequence: 3 });
    const { client } = makeMockClient([row]);
    const result = await getProvenanceLedgerRoot(client, ARTIFACT_ID);
    expect(result).toBe(row);
  });

  it("returns null when no ledger rows exist", async () => {
    const { client } = makeMockClient([]);
    const result = await getProvenanceLedgerRoot(client, ARTIFACT_ID);
    expect(result).toBeNull();
  });

  it("queries by artifact_id ordered by sequence DESC LIMIT 1", async () => {
    const { client, calls } = makeMockClient([]);
    await getProvenanceLedgerRoot(client, ARTIFACT_ID);
    expect(calls[0]?.text).toContain("ORDER BY sequence DESC");
    expect(calls[0]?.text).toContain("LIMIT 1");
    expect(calls[0]?.values[0]).toBe(ARTIFACT_ID);
  });
});

// ===========================================================================
// Tenant isolation contract
// ===========================================================================

describe("tenant isolation — DB layer contract", () => {
  it("insertProvenanceLedgerEntry passes tenant_id as the second parameter", async () => {
    const { client, calls } = makeMockClient([makeLedgerRow()]);
    await insertProvenanceLedgerEntry(client, {
      tenantId:         TENANT_A,
      artifactId:       ARTIFACT_ID,
      sourceVersionId:  SOURCE_VER,
      contentHash:      "a".repeat(64),
      manifestSha256:   "b".repeat(64),
      htmlSha256:        "c".repeat(64),
      leafHash:          "d".repeat(64),
      ledgerRoot:        "e".repeat(64),
      sequence:          1,
    });
    expect(calls[0]?.values[1]).toBe(TENANT_A);
  });
});
