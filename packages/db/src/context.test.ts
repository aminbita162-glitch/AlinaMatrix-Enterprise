/**
 * Context snapshots DB unit tests — ECIDR.
 *
 * Tests the SQL inspection and mock-Db patterns for the context_snapshots
 * table layer. Integration tests (with a live PostgreSQL) are in
 * context.integration.test.ts.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, vi } from "vitest";
import {
  insertContextSnapshot,
  sealContextSnapshot,
  consumeContextSnapshot,
  rejectContextSnapshot,
  getContextSnapshot,
  getContextSnapshotByHash,
  listContextSnapshotsByJob,
  listContextSnapshotsByRun,
} from "./context.js";
import type { ContextSnapshotRow } from "./context.js";

// ============================================================
// Mock client
// ============================================================

type QueryResult<T> = { rows: T[] };

function makeMockClient(queryResults: Record<string, QueryResult<unknown>[]> = {}): {
  client: { query: ReturnType<typeof vi.fn> };
} {
  let callIndex = 0;
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    // Match the SQL to a key for the mock results.
    for (const [key, results] of Object.entries(queryResults)) {
      if (sql.includes(key)) {
        return results[callIndex++] ?? { rows: [] };
      }
    }
    return { rows: [] };
  });
  return { client: { query } };
}

function makeRow(overrides: Partial<ContextSnapshotRow> = {}): ContextSnapshotRow {
  return {
    id: "snapshot-1",
    tenant_id: "aaaaaaaa-0000-4000-a000-000000000001",
    project_id: "aaaaaaaa-0000-4000-a000-000000000301",
    workflow_run_id: "aaaaaaaa-0000-4000-a000-000000000401",
    job_id: "aaaaaaaa-0000-4000-a000-000000000501",
    agent_name: "AlinaArchitect",
    task_kind: "architect_plan",
    source_refs: [],
    prompt_sha256: "a".repeat(64),
    schema_sha256: "b".repeat(64),
    policy_sha256: "c".repeat(64),
    model_version_id: "aaaaaaaa-0000-4000-a000-000000000601",
    agent_version_id: "aaaaaaaa-0000-4000-a000-000000000701",
    canonicalization_version: "canonical-json-v1",
    context_payload_sha256: "d".repeat(64),
    snapshot_sha256: "e".repeat(64),
    authorization_decision_id: "aaaaaaaa-0000-4000-a000-000000000801",
    snapshot_state: "PREPARED",
    sealed_at: null,
    predecessor_snapshot_id: null,
    consumed_at: null,
    consumed_by_job_id: null,
    rejected_at: null,
    reject_reason: null,
    created_at: new Date("2026-10-20T12:00:00.000Z"),
    ...overrides,
  };
}

// ============================================================
// INSERT
// ============================================================

describe("insertContextSnapshot", () => {
  it("inserts a PREPARED snapshot and returns the row", async () => {
    const row = makeRow();
    const { client } = makeMockClient({
      "INSERT INTO context_snapshots": [{ rows: [row] }],
    });

    const result = await insertContextSnapshot(client as unknown as Parameters<typeof insertContextSnapshot>[0], {
      tenantId: row.tenant_id,
      projectId: row.project_id,
      workflowRunId: row.workflow_run_id,
      jobId: row.job_id,
      agentName: row.agent_name,
      taskKind: row.task_kind,
      sourceRefs: [],
      promptSha256: row.prompt_sha256,
      schemaSha256: row.schema_sha256,
      policySha256: row.policy_sha256,
      modelVersionId: row.model_version_id,
      agentVersionId: row.agent_version_id,
      canonicalizationVersion: row.canonicalization_version,
      contextPayloadSha256: row.context_payload_sha256,
      snapshotSha256: row.snapshot_sha256,
      authorizationDecisionId: row.authorization_decision_id,
    });

    expect(result).toEqual(row);
    // SAVEPOINT + INSERT + RELEASE SAVEPOINT = 3 calls.
    expect(client.query).toHaveBeenCalledTimes(3);
    // Verify the INSERT SQL (call index 1) inserts with PREPARED state.
    const sqlArg = (client.query as ReturnType<typeof vi.fn>).mock.calls[1]![0] as string;
    expect(sqlArg).toContain("'PREPARED'");
  });

  it("handles idempotent duplicate (unique constraint violation)", async () => {
    const row = makeRow();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO context_snapshots")) {
        const err = Object.assign(new Error("unique violation"), { code: "23505" });
        throw err;
      }
      if (sql.includes("SELECT * FROM context_snapshots")) {
        return { rows: [row] };
      }
      return { rows: [] };
    });
    const client = { query };

    const result = await insertContextSnapshot(client as unknown as Parameters<typeof insertContextSnapshot>[0], {
      tenantId: row.tenant_id,
      projectId: row.project_id,
      workflowRunId: row.workflow_run_id,
      jobId: row.job_id,
      agentName: row.agent_name,
      taskKind: row.task_kind,
      sourceRefs: [],
      promptSha256: row.prompt_sha256,
      schemaSha256: row.schema_sha256,
      policySha256: row.policy_sha256,
      modelVersionId: row.model_version_id,
      agentVersionId: row.agent_version_id,
      canonicalizationVersion: row.canonicalization_version,
      contextPayloadSha256: row.context_payload_sha256,
      snapshotSha256: row.snapshot_sha256,
      authorizationDecisionId: row.authorization_decision_id,
    });

    expect(result).toEqual(row);
  });
});

// ============================================================
// SEAL
// ============================================================

describe("sealContextSnapshot", () => {
  it("seals a PREPARED snapshot to SEALED", async () => {
    const sealedRow = makeRow({ snapshot_state: "SEALED", sealed_at: new Date("2026-10-20T12:00:01.000Z") });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("UPDATE context_snapshots")) {
        return { rows: [sealedRow] };
      }
      return { rows: [] };
    });
    const client = { query };

    const result = await sealContextSnapshot(client as unknown as Parameters<typeof sealContextSnapshot>[0], {
      snapshotId: "snapshot-1",
      sealedAt: new Date("2026-10-20T12:00:01.000Z"),
      predecessorSnapshotId: null,
    });

    expect(result.snapshot_state).toBe("SEALED");
    expect(result.sealed_at).toEqual(new Date("2026-10-20T12:00:01.000Z"));
  });

  it("throws when snapshot is not PREPARED", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const client = { query };

    await expect(
      sealContextSnapshot(client as unknown as Parameters<typeof sealContextSnapshot>[0], {
        snapshotId: "nonexistent",
        sealedAt: new Date(),
        predecessorSnapshotId: null,
      }),
    ).rejects.toThrow("not found or not in PREPARED state");
  });
});

// ============================================================
// CONSUME
// ============================================================

describe("consumeContextSnapshot", () => {
  it("consumes a SEALED snapshot to CONSUMED", async () => {
    const consumedRow = makeRow({
      snapshot_state: "CONSUMED",
      consumed_at: new Date("2026-10-20T12:00:02.000Z"),
      consumed_by_job_id: "job-2",
    });
    const query = vi.fn(async () => ({ rows: [consumedRow] }));
    const client = { query };

    const result = await consumeContextSnapshot(client as unknown as Parameters<typeof consumeContextSnapshot>[0], {
      snapshotId: "snapshot-1",
      consumedAt: new Date("2026-10-20T12:00:02.000Z"),
      consumedByJobId: "job-2",
    });

    expect(result.snapshot_state).toBe("CONSUMED");
    expect(result.consumed_by_job_id).toBe("job-2");
  });

  it("throws when snapshot is not SEALED", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const client = { query };

    await expect(
      consumeContextSnapshot(client as unknown as Parameters<typeof consumeContextSnapshot>[0], {
        snapshotId: "nonexistent",
        consumedAt: new Date(),
        consumedByJobId: "job-2",
      }),
    ).rejects.toThrow("not found or not in SEALED state");
  });
});

// ============================================================
// REJECT
// ============================================================

describe("rejectContextSnapshot", () => {
  it("rejects a SEALED snapshot to REJECTED", async () => {
    const rejectedRow = makeRow({
      snapshot_state: "REJECTED",
      rejected_at: new Date("2026-10-20T12:00:03.000Z"),
      reject_reason: "HASH_MISMATCH",
    });
    const query = vi.fn(async () => ({ rows: [rejectedRow] }));
    const client = { query };

    const result = await rejectContextSnapshot(client as unknown as Parameters<typeof rejectContextSnapshot>[0], {
      snapshotId: "snapshot-1",
      rejectedAt: new Date("2026-10-20T12:00:03.000Z"),
      rejectReason: "HASH_MISMATCH",
    });

    expect(result.snapshot_state).toBe("REJECTED");
    expect(result.reject_reason).toBe("HASH_MISMATCH");
  });

  it("throws when snapshot is not SEALED", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const client = { query };

    await expect(
      rejectContextSnapshot(client as unknown as Parameters<typeof rejectContextSnapshot>[0], {
        snapshotId: "nonexistent",
        rejectedAt: new Date(),
        rejectReason: "HASH_MISMATCH",
      }),
    ).rejects.toThrow("not found or not in SEALED state");
  });
});

// ============================================================
// GET
// ============================================================

describe("getContextSnapshot", () => {
  it("returns the snapshot when found", async () => {
    const row = makeRow();
    const query = vi.fn(async () => ({ rows: [row] }));
    const client = { query };

    const result = await getContextSnapshot(client as unknown as Parameters<typeof getContextSnapshot>[0], "snapshot-1");
    expect(result).toEqual(row);
  });

  it("returns null when not found", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const client = { query };

    const result = await getContextSnapshot(client as unknown as Parameters<typeof getContextSnapshot>[0], "nonexistent");
    expect(result).toBeNull();
  });
});

describe("getContextSnapshotByHash", () => {
  it("returns the snapshot when found by hash", async () => {
    const row = makeRow();
    const query = vi.fn(async () => ({ rows: [row] }));
    const client = { query };

    const result = await getContextSnapshotByHash(
      client as unknown as Parameters<typeof getContextSnapshotByHash>[0],
      row.tenant_id,
      row.snapshot_sha256,
    );
    expect(result).toEqual(row);
  });

  it("returns null when not found", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const client = { query };

    const result = await getContextSnapshotByHash(
      client as unknown as Parameters<typeof getContextSnapshotByHash>[0],
      "tenant-id",
      "nonexistent-hash",
    );
    expect(result).toBeNull();
  });
});

// ============================================================
// LIST
// ============================================================

describe("listContextSnapshotsByJob", () => {
  it("returns snapshots for a job", async () => {
    const rows = [makeRow(), makeRow({ id: "snapshot-2" })];
    const query = vi.fn(async () => ({ rows }));
    const client = { query };

    const result = await listContextSnapshotsByJob(
      client as unknown as Parameters<typeof listContextSnapshotsByJob>[0],
      "job-1",
    );
    expect(result).toHaveLength(2);
  });
});

describe("listContextSnapshotsByRun", () => {
  it("returns snapshots for a workflow run", async () => {
    const rows = [makeRow(), makeRow({ id: "snapshot-2" })];
    const query = vi.fn(async () => ({ rows }));
    const client = { query };

    const result = await listContextSnapshotsByRun(
      client as unknown as Parameters<typeof listContextSnapshotsByRun>[0],
      "run-1",
    );
    expect(result).toHaveLength(2);
  });
});
