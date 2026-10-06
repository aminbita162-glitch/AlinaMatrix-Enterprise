/**
 * Unit tests for packages/db/src/export-audit.ts — export audit (Phase 9 Unit 2).
 *
 * Uses a mock pg client (no live database required).
 * Also inspects migration 009 SQL for structural correctness.
 *
 * Covers:
 *   - insertExportAudit inserts (append-only); only INSERT, no UPDATE.
 *   - listExportAuditByArtifact queries by artifact_id.
 *   - Migration 009 SQL: table, RLS, immutability triggers, GRANT.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  insertExportAudit,
  listExportAuditByArtifact,
} from "./export-audit.js";
import type { ExportAuditRow } from "./export-audit.js";
import type { DbClient } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(__dirname, "../migrations/009_export_audit.sql");

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
const USER_ID     = "11111111-0000-4000-a000-000000000001";
const NOW = new Date("2026-10-06T12:00:00.000Z");

function makeExportRow(overrides: Partial<ExportAuditRow> = {}): ExportAuditRow {
  return {
    id:             "33333333-0000-4000-e000-000000000003",
    tenant_id:      TENANT_A,
    artifact_id:    ARTIFACT_ID,
    exported_by:    USER_ID,
    permitted:      true,
    denied_reason:  null,
    watermarked:    true,
    html_sha256:    "a".repeat(64),
    exported_at:    NOW,
    created_at:     NOW,
    ...overrides,
  };
}

// ===========================================================================
// Migration 009 SQL structural tests
// ===========================================================================

describe("migration 009 SQL structural checks", () => {
  let sql = "";

  it("migration file can be read", async () => {
    sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql.length).toBeGreaterThan(200);
  });

  it("creates export_audit table", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("CREATE TABLE export_audit");
  });

  it("export_audit has immutability trigger (no update, no delete)", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("export_audit_immutable");
    expect(sql).toContain("BEFORE UPDATE ON export_audit");
    expect(sql).toContain("BEFORE DELETE ON export_audit");
  });

  it("export_audit GRANT excludes UPDATE and DELETE (append-only)", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    const grantLines = sql.split("\n").filter(
      (l) => l.includes("GRANT") && l.includes("export_audit"),
    );
    for (const line of grantLines) {
      expect(line).not.toContain("UPDATE");
      expect(line).not.toContain("DELETE");
    }
  });

  it("RLS enabled and forced on export_audit", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("ALTER TABLE export_audit ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE export_audit FORCE  ROW LEVEL SECURITY");
    expect(sql).toContain("export_audit_tenant");
  });

  it("migration registry entry present", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("INSERT INTO schema_migrations");
    expect(sql).toContain("009_export_audit");
  });
});

// ===========================================================================
// insertExportAudit (append-only — INSERT only)
// ===========================================================================

describe("insertExportAudit", () => {
  it("inserts an audit row and returns it", async () => {
    const expected = makeExportRow();
    const { client } = makeMockClient([expected]);
    const result = await insertExportAudit(client, {
      tenantId: TENANT_A,
      artifactId: ARTIFACT_ID,
      exportedBy: USER_ID,
      permitted: true,
      watermarked: true,
      htmlSha256: "a".repeat(64),
    });
    expect(result).toBe(expected);
  });

  it("only issues an INSERT (no UPDATE)", async () => {
    const { client, calls } = makeMockClient([makeExportRow()]);
    await insertExportAudit(client, {
      tenantId: TENANT_A,
      artifactId: ARTIFACT_ID,
      exportedBy: USER_ID,
      permitted: true,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain("INSERT INTO export_audit");
    expect(calls[0]?.text).not.toContain("UPDATE");
  });

  it("stores a denied export (permitted=false) with a reason", async () => {
    const expected = makeExportRow({ permitted: false, denied_reason: "no permission" });
    const { client, calls } = makeMockClient([expected]);
    await insertExportAudit(client, {
      tenantId: TENANT_A,
      artifactId: ARTIFACT_ID,
      exportedBy: USER_ID,
      permitted: false,
      deniedReason: "no permission",
    });
    expect(calls[0]?.values[4]).toBe(false);
    expect(calls[0]?.values[5]).toBe("no permission");
  });

  it("defaults watermarked to false when not provided", async () => {
    const { client, calls } = makeMockClient([makeExportRow()]);
    await insertExportAudit(client, {
      tenantId: TENANT_A,
      artifactId: ARTIFACT_ID,
      exportedBy: USER_ID,
      permitted: true,
    });
    expect(calls[0]?.values[6]).toBe(false);
  });
});

// ===========================================================================
// listExportAuditByArtifact
// ===========================================================================

describe("listExportAuditByArtifact", () => {
  it("returns all audit rows for an artifact in order", async () => {
    const rows = [makeExportRow(), makeExportRow({ html_sha256: "b".repeat(64) })];
    const { client } = makeMockClient(rows);
    const result = await listExportAuditByArtifact(client, ARTIFACT_ID);
    expect(result).toHaveLength(2);
  });

  it("queries by artifact_id", async () => {
    const { client, calls } = makeMockClient([]);
    await listExportAuditByArtifact(client, ARTIFACT_ID);
    expect(calls[0]?.text).toContain("WHERE artifact_id = $1");
    expect(calls[0]?.values[0]).toBe(ARTIFACT_ID);
  });

  it("returns empty array when no audit rows", async () => {
    const { client } = makeMockClient([]);
    const result = await listExportAuditByArtifact(client, ARTIFACT_ID);
    expect(result).toHaveLength(0);
  });
});

// ===========================================================================
// Tenant isolation contract
// ===========================================================================

describe("tenant isolation — DB layer contract", () => {
  it("insertExportAudit passes tenant_id as the second parameter", async () => {
    const { client, calls } = makeMockClient([makeExportRow()]);
    await insertExportAudit(client, {
      tenantId: TENANT_A,
      artifactId: ARTIFACT_ID,
      exportedBy: USER_ID,
      permitted: true,
    });
    expect(calls[0]?.values[1]).toBe(TENANT_A);
  });
});
