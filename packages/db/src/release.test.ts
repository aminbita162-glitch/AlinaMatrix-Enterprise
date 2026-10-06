/**
 * Unit tests for packages/db/src/release.ts — release labels (Phase 9 Unit 1).
 *
 * Uses a mock pg client (no live database required).
 * Also inspects migration 008 SQL for structural correctness.
 *
 * Covers:
 *   - insertReleaseLabel inserts and returns the row; ON CONFLICT DO NOTHING.
 *   - getReleaseLabel returns the row or null.
 *   - getReleaseLabelByArtifact returns the row or throws.
 *   - publishReleaseLabel issues an UPDATE setting published_html.
 *   - updateReleaseLabel issues an UPDATE with the new label.
 *   - Migration 008 SQL: table, RLS, immutability trigger, GRANT.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  insertReleaseLabel,
  getReleaseLabel,
  getReleaseLabelByArtifact,
  publishReleaseLabel,
  updateReleaseLabel,
} from "./release.js";
import type { ReleaseLabelRow } from "./release.js";
import type { DbClient } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(__dirname, "../migrations/008_release_labels.sql");

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
const PROJECT_ID  = "cccccccc-0000-4000-c000-000000000001";
const ARTIFACT_ID = "dddddddd-0000-4000-d000-000000000001";
const NOW = new Date("2026-10-06T12:00:00.000Z");

function makeLabelRow(overrides: Partial<ReleaseLabelRow> = {}): ReleaseLabelRow {
  return {
    id:                     "11111111-0000-4000-e000-000000000001",
    tenant_id:              TENANT_A,
    project_id:             PROJECT_ID,
    rendered_artifact_id:   ARTIFACT_ID,
    label:                  "DRAFT",
    published_html:          null,
    published_html_sha256:  null,
    published_at:            null,
    revoked_at:              null,
    created_at:             NOW,
    label_updated_at:       NOW,
    ...overrides,
  };
}

// ===========================================================================
// Migration 008 SQL structural tests
// ===========================================================================

describe("migration 008 SQL structural checks", () => {
  let sql = "";

  it("migration file can be read", async () => {
    sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql.length).toBeGreaterThan(200);
  });

  it("creates release_labels table", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("CREATE TABLE release_labels");
  });

  it("release_labels has label CHECK constraint with all six labels", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("DRAFT");
    expect(sql).toContain("INTERNAL_REVIEW");
    expect(sql).toContain("APPROVED");
    expect(sql).toContain("PUBLISHED");
    expect(sql).toContain("ARCHIVED");
    expect(sql).toContain("REVOKED");
    expect(sql).toContain("CHECK (label IN");
  });

  it("release_labels has published_html immutability trigger", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("release_labels_published_html_immutable");
    expect(sql).toContain("BEFORE UPDATE ON release_labels");
    expect(sql).toContain("published_html is immutable");
  });

  it("release_labels GRANT includes UPDATE (label is updatable)", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE ON release_labels TO app_user");
  });

  it("RLS enabled and forced on release_labels", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("ALTER TABLE release_labels ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE release_labels FORCE  ROW LEVEL SECURITY");
    expect(sql).toContain("release_labels_tenant");
  });

  it("migration registry entry present", async () => {
    if (!sql) sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("INSERT INTO schema_migrations");
    expect(sql).toContain("008_release_labels");
  });
});

// ===========================================================================
// insertReleaseLabel
// ===========================================================================

describe("insertReleaseLabel", () => {
  it("inserts a label and returns the row", async () => {
    const expected = makeLabelRow();
    const { client } = makeMockClient([expected]);
    const result = await insertReleaseLabel(client, {
      tenantId: TENANT_A, projectId: PROJECT_ID, renderedArtifactId: ARTIFACT_ID,
    });
    expect(result).toBe(expected);
  });

  it("uses ON CONFLICT DO NOTHING for idempotency", async () => {
    const { client, calls } = makeMockClient([makeLabelRow()]);
    await insertReleaseLabel(client, {
      tenantId: TENANT_A, projectId: PROJECT_ID, renderedArtifactId: ARTIFACT_ID,
    });
    expect(calls[0]?.text).toContain("ON CONFLICT (rendered_artifact_id) DO NOTHING");
  });

  it("defaults label to DRAFT when not specified", async () => {
    const { client, calls } = makeMockClient([makeLabelRow()]);
    await insertReleaseLabel(client, {
      tenantId: TENANT_A, projectId: PROJECT_ID, renderedArtifactId: ARTIFACT_ID,
    });
    expect(calls[0]?.values[4]).toBe("DRAFT");
  });

  it("falls back to getReleaseLabelByArtifact when ON CONFLICT fires", async () => {
    const existing = makeLabelRow();
    let callCount = 0;
    const client = {
      query: vi.fn(async () => {
        callCount++;
        return callCount === 1 ? { rows: [] } : { rows: [existing] };
      }),
    } as unknown as DbClient;
    const result = await insertReleaseLabel(client, {
      tenantId: TENANT_A, projectId: PROJECT_ID, renderedArtifactId: ARTIFACT_ID,
    });
    expect(result).toBe(existing);
    expect(callCount).toBe(2);
  });
});

// ===========================================================================
// getReleaseLabel
// ===========================================================================

describe("getReleaseLabel", () => {
  it("returns the row when found", async () => {
    const expected = makeLabelRow();
    const { client } = makeMockClient([expected]);
    const result = await getReleaseLabel(client, "some-id");
    expect(result).toBe(expected);
  });

  it("returns null when not found", async () => {
    const { client } = makeMockClient([]);
    const result = await getReleaseLabel(client, "missing-id");
    expect(result).toBeNull();
  });
});

// ===========================================================================
// getReleaseLabelByArtifact
// ===========================================================================

describe("getReleaseLabelByArtifact", () => {
  it("returns the row when found", async () => {
    const expected = makeLabelRow();
    const { client } = makeMockClient([expected]);
    const result = await getReleaseLabelByArtifact(client, ARTIFACT_ID);
    expect(result).toBe(expected);
  });

  it("throws when no row is found", async () => {
    const { client } = makeMockClient([]);
    await expect(getReleaseLabelByArtifact(client, ARTIFACT_ID)).rejects.toThrow(
      "Release label not found",
    );
  });
});

// ===========================================================================
// publishReleaseLabel
// ===========================================================================

describe("publishReleaseLabel", () => {
  it("issues an UPDATE setting label to PUBLISHED and published_html", async () => {
    const expected = makeLabelRow({ label: "PUBLISHED", published_html: "<html></html>" });
    const { client, calls } = makeMockClient([expected]);
    const result = await publishReleaseLabel(client, {
      renderedArtifactId: ARTIFACT_ID,
      publishedHtml: "<html></html>",
      publishedHtmlSha256: "a".repeat(64),
    });
    expect(result).toBe(expected);
    expect(calls[0]?.text).toContain("UPDATE release_labels");
    expect(calls[0]?.text).toContain("label = 'PUBLISHED'");
    expect(calls[0]?.text).toContain("published_html = $2");
  });

  it("passes publishedHtmlSha256 as the third parameter", async () => {
    const { client, calls } = makeMockClient([makeLabelRow()]);
    await publishReleaseLabel(client, {
      renderedArtifactId: ARTIFACT_ID,
      publishedHtml: "<html></html>",
      publishedHtmlSha256: "b".repeat(64),
    });
    expect(calls[0]?.values[2]).toBe("b".repeat(64));
  });

  it("throws when the release label is not found", async () => {
    const { client } = makeMockClient([]);
    await expect(publishReleaseLabel(client, {
      renderedArtifactId: ARTIFACT_ID,
      publishedHtml: "<html></html>",
      publishedHtmlSha256: "a".repeat(64),
    })).rejects.toThrow("Release label not found");
  });
});

// ===========================================================================
// updateReleaseLabel
// ===========================================================================

describe("updateReleaseLabel", () => {
  it("issues an UPDATE with the new label", async () => {
    const expected = makeLabelRow({ label: "ARCHIVED" });
    const { client, calls } = makeMockClient([expected]);
    await updateReleaseLabel(client, ARTIFACT_ID, "ARCHIVED");
    expect(calls[0]?.text).toContain("UPDATE release_labels");
    expect(calls[0]?.values[0]).toBe(ARTIFACT_ID);
    expect(calls[0]?.values[1]).toBe("ARCHIVED");
  });

  it("sets revoked_at when label is REVOKED", async () => {
    const expected = makeLabelRow({ label: "REVOKED" });
    const { client, calls } = makeMockClient([expected]);
    await updateReleaseLabel(client, ARTIFACT_ID, "REVOKED");
    expect(calls[0]?.values[2]).toBeInstanceOf(Date);
  });

  it("passes null for revoked_at when label is not REVOKED", async () => {
    const expected = makeLabelRow({ label: "ARCHIVED" });
    const { client, calls } = makeMockClient([expected]);
    await updateReleaseLabel(client, ARTIFACT_ID, "ARCHIVED");
    expect(calls[0]?.values[2]).toBeNull();
  });
});

// ===========================================================================
// Tenant isolation contract
// ===========================================================================

describe("tenant isolation — DB layer contract", () => {
  it("insertReleaseLabel passes tenant_id as the second parameter", async () => {
    const { client, calls } = makeMockClient([makeLabelRow()]);
    await insertReleaseLabel(client, {
      tenantId: TENANT_A, projectId: PROJECT_ID, renderedArtifactId: ARTIFACT_ID,
    });
    expect(calls[0]?.values[1]).toBe(TENANT_A);
  });
});
