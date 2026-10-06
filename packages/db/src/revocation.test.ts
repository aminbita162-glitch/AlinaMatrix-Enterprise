/**
 * Unit tests for packages/db/src/revocation.ts — revocation events (Phase 9 Unit 4).
 *
 * Uses a mock pg client (no live database required).
 * Also inspects migration 011 SQL for structural correctness.
 *
 * Covers:
 *   - insertRevocationEvent inserts (append-only); only INSERT, no UPDATE.
 *   - listRevocationEventsByArtifact queries by artifact_id.
 *   - Migration 011 SQL: table, RLS, immutability triggers, GRANT, registry.
 *   - Revocation preserves published bytes: migration 008 trigger protects
 *     published_html, migration 011 is append-only.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  insertRevocationEvent,
  listRevocationEventsByArtifact,
} from "./revocation.js";
import type { RevocationEventRow } from "./revocation.js";
import type { DbClient } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_011_PATH = join(__dirname, "../migrations/011_revocation_events.sql");
const MIGRATION_008_PATH = join(__dirname, "../migrations/008_release_labels.sql");

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

function makeRevocationRow(overrides: Partial<RevocationEventRow> = {}): RevocationEventRow {
  return {
    id:            "33333333-0000-4000-r000-000000000003",
    tenant_id:      TENANT_A,
    artifact_id:    ARTIFACT_ID,
    revoked_by:     USER_ID,
    reason:         "Superseded by version 2",
    revoked_at:     NOW,
    prior_label:    "PUBLISHED",
    created_at:     NOW,
    ...overrides,
  };
}

// ===========================================================================
// Migration 011 SQL structural tests
// ===========================================================================

describe("migration 011 SQL structural checks", () => {
  let sql = "";

  it("migration file can be read", async () => {
    sql = await readFile(MIGRATION_011_PATH, "utf8");
    expect(sql.length).toBeGreaterThan(200);
  });

  it("creates revocation_events table", async () => {
    if (!sql) sql = await readFile(MIGRATION_011_PATH, "utf8");
    expect(sql).toContain("CREATE TABLE revocation_events");
  });

  it("has immutability triggers (no update, no delete)", async () => {
    if (!sql) sql = await readFile(MIGRATION_011_PATH, "utf8");
    expect(sql).toContain("revocation_events_immutable");
    expect(sql).toContain("BEFORE UPDATE ON revocation_events");
    expect(sql).toContain("BEFORE DELETE ON revocation_events");
  });

  it("GRANT excludes UPDATE and DELETE (append-only)", async () => {
    if (!sql) sql = await readFile(MIGRATION_011_PATH, "utf8");
    const grantLines = sql.split("\n").filter(
      (l) => l.includes("GRANT") && l.includes("revocation_events"),
    );
    for (const line of grantLines) {
      expect(line).not.toContain("UPDATE");
      expect(line).not.toContain("DELETE");
    }
  });

  it("RLS enabled and forced on revocation_events", async () => {
    if (!sql) sql = await readFile(MIGRATION_011_PATH, "utf8");
    expect(sql).toContain("ALTER TABLE revocation_events ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE revocation_events FORCE  ROW LEVEL SECURITY");
    expect(sql).toContain("revocation_events_tenant");
  });

  it("has prior_label CHECK constraint", async () => {
    if (!sql) sql = await readFile(MIGRATION_011_PATH, "utf8");
    expect(sql).toContain("prior_label");
    expect(sql).toContain("CHECK");
  });

  it("migration registry entry present", async () => {
    if (!sql) sql = await readFile(MIGRATION_011_PATH, "utf8");
    expect(sql).toContain("INSERT INTO schema_migrations");
    expect(sql).toContain("011_revocation_events");
  });
});

// ===========================================================================
// Revocation preserves published bytes — migration 008 cross-check
// ===========================================================================

describe("revocation preserves published bytes (migration 008 cross-check)", () => {
  let sql008 = "";

  it("migration 008 has a trigger that rejects UPDATE of published_html", async () => {
    sql008 = await readFile(MIGRATION_008_PATH, "utf8");
    expect(sql008).toContain("release_labels_published_html_immutable");
    expect(sql008).toContain("BEFORE UPDATE ON release_labels");
    expect(sql008).toContain("published_html is immutable");
  });
});

// ===========================================================================
// insertRevocationEvent (append-only — INSERT only)
// ===========================================================================

describe("insertRevocationEvent", () => {
  it("inserts a revocation event row and returns it", async () => {
    const expected = makeRevocationRow();
    const { client } = makeMockClient([expected]);
    const result = await insertRevocationEvent(client, {
      tenantId:   TENANT_A,
      artifactId: ARTIFACT_ID,
      revokedBy:  USER_ID,
      reason:     "Superseded by version 2",
      priorLabel: "PUBLISHED",
    });
    expect(result).toBe(expected);
  });

  it("only issues an INSERT (no UPDATE)", async () => {
    const { client, calls } = makeMockClient([makeRevocationRow()]);
    await insertRevocationEvent(client, {
      tenantId:   TENANT_A,
      artifactId: ARTIFACT_ID,
      revokedBy:  USER_ID,
      reason:     "reason",
      priorLabel: "PUBLISHED",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain("INSERT INTO revocation_events");
    expect(calls[0]?.text).not.toContain("UPDATE");
  });

  it("stores the prior_label as PUBLISHED", async () => {
    const { client, calls } = makeMockClient([makeRevocationRow()]);
    await insertRevocationEvent(client, {
      tenantId:   TENANT_A,
      artifactId: ARTIFACT_ID,
      revokedBy:  USER_ID,
      reason:     "reason",
      priorLabel: "PUBLISHED",
    });
    expect(calls[0]?.values[6]).toBe("PUBLISHED");
  });

  it("stores the prior_label as ARCHIVED", async () => {
    const { client, calls } = makeMockClient([makeRevocationRow({ prior_label: "ARCHIVED" })]);
    await insertRevocationEvent(client, {
      tenantId:   TENANT_A,
      artifactId: ARTIFACT_ID,
      revokedBy:  USER_ID,
      reason:     "archived artifact revoked",
      priorLabel: "ARCHIVED",
    });
    expect(calls[0]?.values[6]).toBe("ARCHIVED");
  });

  it("does not touch published_html (no reference to release_labels)", async () => {
    const { client, calls } = makeMockClient([makeRevocationRow()]);
    await insertRevocationEvent(client, {
      tenantId:   TENANT_A,
      artifactId: ARTIFACT_ID,
      revokedBy:  USER_ID,
      reason:     "reason",
      priorLabel: "PUBLISHED",
    });
    expect(calls[0]?.text).not.toContain("published_html");
    expect(calls[0]?.text).not.toContain("release_labels");
  });
});

// ===========================================================================
// listRevocationEventsByArtifact
// ===========================================================================

describe("listRevocationEventsByArtifact", () => {
  it("returns all revocation events for an artifact in order", async () => {
    const rows = [makeRevocationRow(), makeRevocationRow({ reason: "second" })];
    const { client } = makeMockClient(rows);
    const result = await listRevocationEventsByArtifact(client, ARTIFACT_ID);
    expect(result).toHaveLength(2);
  });

  it("queries by artifact_id", async () => {
    const { client, calls } = makeMockClient([]);
    await listRevocationEventsByArtifact(client, ARTIFACT_ID);
    expect(calls[0]?.text).toContain("WHERE artifact_id = $1");
    expect(calls[0]?.values[0]).toBe(ARTIFACT_ID);
  });

  it("returns empty array when no revocation events", async () => {
    const { client } = makeMockClient([]);
    const result = await listRevocationEventsByArtifact(client, ARTIFACT_ID);
    expect(result).toHaveLength(0);
  });
});

// ===========================================================================
// Tenant isolation contract
// ===========================================================================

describe("tenant isolation — DB layer contract", () => {
  it("insertRevocationEvent passes tenant_id as the second parameter", async () => {
    const { client, calls } = makeMockClient([makeRevocationRow()]);
    await insertRevocationEvent(client, {
      tenantId:   TENANT_A,
      artifactId: ARTIFACT_ID,
      revokedBy:  USER_ID,
      reason:     "reason",
      priorLabel: "PUBLISHED",
    });
    expect(calls[0]?.values[1]).toBe(TENANT_A);
  });
});
