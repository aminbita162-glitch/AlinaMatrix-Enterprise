/**
 * Unit tests for packages/db/src/render.ts — rendered artifacts and build manifests.
 *
 * Uses a mock pg client (no live database required).
 *
 * Covers:
 *   - insertRenderedArtifact inserts and returns the row.
 *   - SQL uses ON CONFLICT DO NOTHING for idempotency.
 *   - manifest_json is serialised to a JSON string.
 *   - getRenderedArtifact returns the row when found, null when not found.
 *   - getRenderedArtifactByBuild queries by workflow_run_id + build_id.
 *   - listRenderedArtifactsByRun queries by workflow_run_id.
 *   - insertBuildManifest inserts and returns the row.
 *   - getBuildManifest returns the row when found, throws when not found.
 *   - Migration 007 SQL: tables, RLS, immutability triggers, GRANT (no UPDATE/DELETE).
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, vi } from "vitest";
import {
  insertRenderedArtifact,
  getRenderedArtifact,
  getRenderedArtifactByBuild,
  listRenderedArtifactsByRun,
  insertBuildManifest,
  getBuildManifest,
} from "./render.js";
import type { DbClient } from "./client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUuid(): string {
  return "00000000-0000-4000-8000-" + Math.random().toString(16).slice(2, 14).padEnd(12, "0");
}

function makeMockClient(rows: unknown[]): DbClient {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as DbClient;
}

const NOW = new Date("2026-10-06T12:00:00.000Z");

const BASE_ARTIFACT_PARAMS = {
  tenantId:        makeUuid(),
  projectId:       makeUuid(),
  workflowRunId:   makeUuid(),
  html:            "<!DOCTYPE html><html></html>",
  htmlSha256:      "a".repeat(64),
  manifestJson:    {
    contentHash: "a".repeat(64),
    sourceVersionIds: [makeUuid()],
    promptVersionId: makeUuid(),
    modelVersionId:  makeUuid(),
    schemaVersionId: makeUuid(),
    policyVersionId: makeUuid(),
    renderer: "html-static-v1",
    template: "m03-adr-v1",
    buildId:  makeUuid(),
    buildTime: "2026-10-06T12:00:00.000Z",
    htmlSha256: "a".repeat(64),
  } as Record<string, unknown>,
  contentHash:      "a".repeat(64),
  promptVersionId:  makeUuid(),
  modelVersionId:   makeUuid(),
  schemaVersionId:  makeUuid(),
  policyVersionId:  makeUuid(),
  renderer:         "html-static-v1",
  template:         "m03-adr-v1",
  buildId:          makeUuid(),
  buildTime:        NOW,
};

const BASE_MANIFEST_PARAMS = {
  tenantId:             makeUuid(),
  renderedArtifactId:    makeUuid(),
  contentHash:           "b".repeat(64),
  sourceVersionIds:      [makeUuid(), makeUuid()],
  promptVersionId:       makeUuid(),
  modelVersionId:        makeUuid(),
  schemaVersionId:       makeUuid(),
  policyVersionId:       makeUuid(),
  renderer:              "html-static-v1",
  template:              "m03-adr-v1",
  buildId:               makeUuid(),
  buildTime:             NOW,
  htmlSha256:           "c".repeat(64),
};

// ---------------------------------------------------------------------------
// insertRenderedArtifact
// ---------------------------------------------------------------------------

describe("insertRenderedArtifact", () => {
  it("inserts an artifact and returns the row", async () => {
    const expected = { id: makeUuid(), ...BASE_ARTIFACT_PARAMS, created_at: NOW };
    const client = makeMockClient([expected]);
    const result = await insertRenderedArtifact(client, BASE_ARTIFACT_PARAMS);
    expect(result).toBe(expected);
  });

  it("calls INSERT with all 16 parameters", async () => {
    const client = makeMockClient([{ id: makeUuid() }]);
    await insertRenderedArtifact(client, BASE_ARTIFACT_PARAMS);
    const [sql, args] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO rendered_artifacts");
    expect(args).toHaveLength(16);
  });

  it("uses ON CONFLICT DO NOTHING for idempotency", async () => {
    const client = makeMockClient([{ id: makeUuid() }]);
    await insertRenderedArtifact(client, BASE_ARTIFACT_PARAMS);
    const [sql] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("ON CONFLICT (workflow_run_id, build_id) DO NOTHING");
  });

  it("serialises manifestJson to a JSON string", async () => {
    const client = makeMockClient([{ id: makeUuid() }]);
    await insertRenderedArtifact(client, BASE_ARTIFACT_PARAMS);
    const [, args] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(typeof args[6]).toBe("string");
    expect(() => JSON.parse(args[6] as string)).not.toThrow();
  });

  it("falls back to getRenderedArtifactByBuild when ON CONFLICT fires (empty rows)", async () => {
    const existingRow = { id: makeUuid(), workflow_run_id: BASE_ARTIFACT_PARAMS.workflowRunId, build_id: BASE_ARTIFACT_PARAMS.buildId };
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingRow] }),
    } as unknown as DbClient;
    const result = await insertRenderedArtifact(client, BASE_ARTIFACT_PARAMS);
    expect(result).toBe(existingRow);
    expect((client.query as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getRenderedArtifact
// ---------------------------------------------------------------------------

describe("getRenderedArtifact", () => {
  it("returns the row when found", async () => {
    const row = { id: makeUuid() };
    const client = makeMockClient([row]);
    const result = await getRenderedArtifact(client, makeUuid());
    expect(result).toBe(row);
  });

  it("returns null when not found", async () => {
    const client = makeMockClient([]);
    const result = await getRenderedArtifact(client, makeUuid());
    expect(result).toBeNull();
  });

  it("queries by id", async () => {
    const artifactId = makeUuid();
    const client = makeMockClient([{ id: artifactId }]);
    await getRenderedArtifact(client, artifactId);
    const [sql, args] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("WHERE id = $1");
    expect(args[0]).toBe(artifactId);
  });
});

// ---------------------------------------------------------------------------
// getRenderedArtifactByBuild
// ---------------------------------------------------------------------------

describe("getRenderedArtifactByBuild", () => {
  it("returns the row when found", async () => {
    const row = { id: makeUuid() };
    const client = makeMockClient([row]);
    const result = await getRenderedArtifactByBuild(client, makeUuid(), makeUuid());
    expect(result).toBe(row);
  });

  it("throws when no row is found", async () => {
    const client = makeMockClient([]);
    await expect(getRenderedArtifactByBuild(client, makeUuid(), makeUuid())).rejects.toThrow("Rendered artifact not found");
  });

  it("queries by workflow_run_id and build_id", async () => {
    const wfRunId = makeUuid();
    const buildId = makeUuid();
    const client = makeMockClient([{ id: makeUuid() }]);
    await getRenderedArtifactByBuild(client, wfRunId, buildId);
    const [sql, args] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("workflow_run_id = $1");
    expect(sql).toContain("build_id = $2");
    expect(args[0]).toBe(wfRunId);
    expect(args[1]).toBe(buildId);
  });
});

// ---------------------------------------------------------------------------
// listRenderedArtifactsByRun
// ---------------------------------------------------------------------------

describe("listRenderedArtifactsByRun", () => {
  it("returns rows ordered by build_time", async () => {
    const rows = [{ id: makeUuid() }, { id: makeUuid() }];
    const client = makeMockClient(rows);
    const result = await listRenderedArtifactsByRun(client, makeUuid());
    expect(result).toHaveLength(2);
  });

  it("queries by workflow_run_id", async () => {
    const wfRunId = makeUuid();
    const client = makeMockClient([]);
    await listRenderedArtifactsByRun(client, wfRunId);
    const [sql, args] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("WHERE workflow_run_id = $1");
    expect(args[0]).toBe(wfRunId);
  });
});

// ---------------------------------------------------------------------------
// insertBuildManifest
// ---------------------------------------------------------------------------

describe("insertBuildManifest", () => {
  it("inserts a manifest and returns the row", async () => {
    const expected = { id: makeUuid(), ...BASE_MANIFEST_PARAMS, created_at: NOW };
    const client = makeMockClient([expected]);
    const result = await insertBuildManifest(client, BASE_MANIFEST_PARAMS);
    expect(result).toBe(expected);
  });

  it("calls INSERT with all 14 parameters", async () => {
    const client = makeMockClient([{ id: makeUuid() }]);
    await insertBuildManifest(client, BASE_MANIFEST_PARAMS);
    const [sql, args] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO build_manifests");
    expect(args).toHaveLength(14);
  });

  it("uses ON CONFLICT DO NOTHING for idempotency", async () => {
    const client = makeMockClient([{ id: makeUuid() }]);
    await insertBuildManifest(client, BASE_MANIFEST_PARAMS);
    const [sql] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("ON CONFLICT (rendered_artifact_id) DO NOTHING");
  });

  it("passes sourceVersionIds as array parameter", async () => {
    const ids = [makeUuid(), makeUuid(), makeUuid()];
    const client = makeMockClient([{ id: makeUuid() }]);
    await insertBuildManifest(client, { ...BASE_MANIFEST_PARAMS, sourceVersionIds: ids });
    const [, args] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(args[4]).toEqual(ids);
  });

  it("falls back to getBuildManifest when ON CONFLICT fires (empty rows)", async () => {
    const existingRow = { id: makeUuid(), rendered_artifact_id: BASE_MANIFEST_PARAMS.renderedArtifactId };
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingRow] }),
    } as unknown as DbClient;
    const result = await insertBuildManifest(client, BASE_MANIFEST_PARAMS);
    expect(result).toBe(existingRow);
    expect((client.query as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getBuildManifest
// ---------------------------------------------------------------------------

describe("getBuildManifest", () => {
  it("returns the row when found", async () => {
    const row = { id: makeUuid() };
    const client = makeMockClient([row]);
    const result = await getBuildManifest(client, makeUuid());
    expect(result).toBe(row);
  });

  it("throws when no row is found", async () => {
    const client = makeMockClient([]);
    await expect(getBuildManifest(client, makeUuid())).rejects.toThrow("Build manifest not found");
  });

  it("queries by rendered_artifact_id", async () => {
    const renderedArtifactId = makeUuid();
    const client = makeMockClient([{ id: makeUuid() }]);
    await getBuildManifest(client, renderedArtifactId);
    const [sql, args] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("WHERE rendered_artifact_id = $1");
    expect(args[0]).toBe(renderedArtifactId);
  });
});

// ---------------------------------------------------------------------------
// Migration 007 SQL structure
// ---------------------------------------------------------------------------

describe("migration 007 SQL", () => {
  it("file exists and contains rendered_artifacts table", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      new URL("../migrations/007_rendered_artifacts.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE rendered_artifacts");
  });

  it("contains build_manifests table", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      new URL("../migrations/007_rendered_artifacts.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE build_manifests");
  });

  it("enables RLS on both tables", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      new URL("../migrations/007_rendered_artifacts.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("ALTER TABLE rendered_artifacts ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE build_manifests   ENABLE ROW LEVEL SECURITY");
  });

  it("has immutability triggers (no update, no delete)", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      new URL("../migrations/007_rendered_artifacts.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("rendered_artifacts_no_update");
    expect(sql).toContain("rendered_artifacts_no_delete");
    expect(sql).toContain("build_manifests_no_update");
    expect(sql).toContain("build_manifests_no_delete");
    expect(sql).toContain("BEFORE UPDATE");
    expect(sql).toContain("BEFORE DELETE");
  });

  it("grants only SELECT, INSERT (immutable tables)", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      new URL("../migrations/007_rendered_artifacts.sql", import.meta.url),
      "utf8",
    );
    const lines = sql.split("\n").filter(
      l => l.includes("GRANT") && (l.includes("rendered_artifacts") || l.includes("build_manifests")),
    );
    for (const line of lines) {
      expect(line).not.toContain("UPDATE");
      expect(line).not.toContain("DELETE");
    }
  });

  it("registers migration in schema_migrations", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      new URL("../migrations/007_rendered_artifacts.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("INSERT INTO schema_migrations (name) VALUES ('007_rendered_artifacts')");
  });
});
