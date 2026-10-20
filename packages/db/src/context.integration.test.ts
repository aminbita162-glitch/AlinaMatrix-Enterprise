/**
 * Context snapshots live RLS integration tests — ECIDR.
 *
 * Requires a running PostgreSQL 16 with migrations 001-015 applied and the
 * fixture seed loaded. Skipped automatically when DATABASE_URL is not set.
 *
 * Run:
 *   DATABASE_URL=postgres://app_user:***@localhost:5432/alinamatrix \
 *   SUPERUSER_URL=postgres://alinamatrix:***@localhost:5432/alinamatrix \
 *     pnpm exec vitest run src/context.integration.test.ts
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPool, withTransaction, setTenantContext } from "../src/index.js";
import {
  insertContextSnapshot,
  sealContextSnapshot,
  consumeContextSnapshot,
  rejectContextSnapshot,
  getContextSnapshotByHash,
} from "../src/context.js";
import type { DbPool } from "../src/index.js";

const DATABASE_URL = process.env["DATABASE_URL"];
const SUPERUSER_URL =
  process.env["SUPERUSER_URL"] ?? "postgres://alinamatrix:***@localhost:5432/alinamatrix";

const describeIf = DATABASE_URL ? describe : describe.skip;

// Fixture IDs
const TENANT_A = "aaaaaaaa-0000-4000-a000-000000000001";
const TENANT_B = "bbbbbbbb-0000-4000-b000-000000000002";
const PROJECT_A = "aaaaaaaa-0000-4000-a000-000000000301";
const PROJECT_B = "bbbbbbbb-0000-4000-b000-000000000302";
const RUN_A = "11111111-0000-4000-8000-000000000001";
const JOB_A = "22222222-0000-4000-8000-000000000001";
const JOB_B = "33333333-0000-4000-8000-000000000002";
const MODEL_VER = "44444444-0000-4000-8000-000000000001";
const AGENT_VER = "55555555-0000-4000-8000-000000000001";
const AUTH_DEC = "66666666-0000-4000-8000-000000000001";

const SHA = (s: string) =>
  Array.from({ length: 64 }, (_, i) =>
    "0123456789abcdef"[(s.charCodeAt(i % s.length) + i) % 16],
  ).join("");

let appPool: DbPool;
let suPool: DbPool;

beforeAll(async () => {
  if (!DATABASE_URL) return;
  appPool = createPool(DATABASE_URL);
  suPool = createPool(SUPERUSER_URL);

  // Insert test projects via the superuser pool (bypasses RLS for setup only).
  await suPool.query(
    "INSERT INTO projects (id, tenant_id, name) VALUES ($1, $2, 'Project A') ON CONFLICT (id) DO NOTHING",
    [PROJECT_A, TENANT_A],
  );
  await suPool.query(
    "INSERT INTO projects (id, tenant_id, name) VALUES ($1, $2, 'Project B') ON CONFLICT (id) DO NOTHING",
    [PROJECT_B, TENANT_B],
  );
});

afterAll(async () => {
  if (suPool) {
    // Disable triggers for cleanup (SEALED/CONSUMED/REJECTED rows are immutable
    // under the trigger; superuser cleanup needs to bypass it).
    await suPool.query("SET session_replication_role = replica");
    await suPool.query("DELETE FROM context_snapshots WHERE job_id IN ($1, $2)", [JOB_A, JOB_B]);
    await suPool.query("SET session_replication_role = origin");
    await suPool.query("DELETE FROM projects WHERE id IN ($1, $2)", [PROJECT_A, PROJECT_B]);
    await suPool.end();
  }
  if (appPool) await appPool.end();
});

// ============================================================
// Integration tests
// ============================================================

describeIf("context snapshots integration — tenant isolation", () => {
  it("inserts a PREPARED snapshot under tenant A", async () => {
    await withTransaction(appPool, async (client) => {
      await setTenantContext(client, TENANT_A);
      const row = await insertContextSnapshot(client, {
        tenantId: TENANT_A,
        projectId: PROJECT_A,
        workflowRunId: RUN_A,
        jobId: JOB_A,
        agentName: "AlinaArchitect",
        taskKind: "architect_plan",
        sourceRefs: [{ sourceVersionId: "00000000-0000-4000-8000-000000000010", contentSha256: SHA("a"), evidenceFragmentRefs: [] }],
        promptSha256: SHA("prompt"),
        schemaSha256: SHA("schema"),
        policySha256: SHA("policy"),
        modelVersionId: MODEL_VER,
        agentVersionId: AGENT_VER,
        canonicalizationVersion: "canonical-json-v1",
        contextPayloadSha256: SHA("payload"),
        snapshotSha256: SHA("snapshot-1"),
        authorizationDecisionId: AUTH_DEC,
      });
      expect(row.snapshot_state).toBe("PREPARED");
      expect(row.tenant_id).toBe(TENANT_A);
    });
  });

  it("tenant B cannot see tenant A's snapshot (RLS)", async () => {
    // First insert under tenant A.
    const snapshotSha = SHA("snapshot-isolation");
    await withTransaction(appPool, async (client) => {
      await setTenantContext(client, TENANT_A);
      await insertContextSnapshot(client, {
        tenantId: TENANT_A,
        projectId: PROJECT_A,
        workflowRunId: RUN_A,
        jobId: JOB_A,
        agentName: "AlinaArchitect",
        taskKind: "architect_plan",
        sourceRefs: [{ sourceVersionId: "00000000-0000-4000-8000-000000000010", contentSha256: SHA("a"), evidenceFragmentRefs: [] }],
        promptSha256: SHA("prompt"),
        schemaSha256: SHA("schema"),
        policySha256: SHA("policy"),
        modelVersionId: MODEL_VER,
        agentVersionId: AGENT_VER,
        canonicalizationVersion: "canonical-json-v1",
        contextPayloadSha256: SHA("payload"),
        snapshotSha256: snapshotSha,
        authorizationDecisionId: AUTH_DEC,
      });
    });

    // Then try to read it under tenant B — should not find it.
    await withTransaction(appPool, async (client) => {
      await setTenantContext(client, TENANT_B);
      const found = await getContextSnapshotByHash(client, TENANT_A, snapshotSha);
      expect(found).toBeNull();
    });
  });

  it("seals a PREPARED snapshot to SEALED", async () => {
    const snapshotSha = SHA("snapshot-seal");
    let snapshotId: string;

    // Insert.
    await withTransaction(appPool, async (client) => {
      await setTenantContext(client, TENANT_A);
      const row = await insertContextSnapshot(client, {
        tenantId: TENANT_A,
        projectId: PROJECT_A,
        workflowRunId: RUN_A,
        jobId: JOB_A,
        agentName: "AlinaArchitect",
        taskKind: "architect_plan",
        sourceRefs: [{ sourceVersionId: "00000000-0000-4000-8000-000000000010", contentSha256: SHA("a"), evidenceFragmentRefs: [] }],
        promptSha256: SHA("prompt"),
        schemaSha256: SHA("schema"),
        policySha256: SHA("policy"),
        modelVersionId: MODEL_VER,
        agentVersionId: AGENT_VER,
        canonicalizationVersion: "canonical-json-v1",
        contextPayloadSha256: SHA("payload"),
        snapshotSha256: snapshotSha,
        authorizationDecisionId: AUTH_DEC,
      });
      snapshotId = row.id;
    });

    // Seal.
    await withTransaction(appPool, async (client) => {
      await setTenantContext(client, TENANT_A);
      const sealed = await sealContextSnapshot(client, {
        snapshotId: snapshotId!,
        sealedAt: new Date("2026-10-20T12:00:01.000Z"),
        predecessorSnapshotId: null,
      });
      expect(sealed.snapshot_state).toBe("SEALED");
      expect(sealed.sealed_at).toEqual(new Date("2026-10-20T12:00:01.000Z"));
    });
  });

  it("consumes a SEALED snapshot to CONSUMED", async () => {
    const snapshotSha = SHA("snapshot-consume");
    let snapshotId: string;

    // Insert + seal.
    await withTransaction(appPool, async (client) => {
      await setTenantContext(client, TENANT_A);
      const row = await insertContextSnapshot(client, {
        tenantId: TENANT_A,
        projectId: PROJECT_A,
        workflowRunId: RUN_A,
        jobId: JOB_A,
        agentName: "AlinaArchitect",
        taskKind: "architect_plan",
        sourceRefs: [{ sourceVersionId: "00000000-0000-4000-8000-000000000010", contentSha256: SHA("a"), evidenceFragmentRefs: [] }],
        promptSha256: SHA("prompt"),
        schemaSha256: SHA("schema"),
        policySha256: SHA("policy"),
        modelVersionId: MODEL_VER,
        agentVersionId: AGENT_VER,
        canonicalizationVersion: "canonical-json-v1",
        contextPayloadSha256: SHA("payload"),
        snapshotSha256: snapshotSha,
        authorizationDecisionId: AUTH_DEC,
      });
      snapshotId = row.id;
      await sealContextSnapshot(client, {
        snapshotId: row.id,
        sealedAt: new Date("2026-10-20T12:00:01.000Z"),
        predecessorSnapshotId: null,
      });
    });

    // Consume.
    await withTransaction(appPool, async (client) => {
      await setTenantContext(client, TENANT_A);
      const consumed = await consumeContextSnapshot(client, {
        snapshotId: snapshotId!,
        consumedAt: new Date("2026-10-20T12:00:02.000Z"),
        consumedByJobId: JOB_A,
      });
      expect(consumed.snapshot_state).toBe("CONSUMED");
      expect(consumed.consumed_by_job_id).toBe(JOB_A);
    });
  });

  it("rejects a SEALED snapshot to REJECTED", async () => {
    const snapshotSha = SHA("snapshot-reject");
    let snapshotId: string;

    // Insert + seal.
    await withTransaction(appPool, async (client) => {
      await setTenantContext(client, TENANT_A);
      const row = await insertContextSnapshot(client, {
        tenantId: TENANT_A,
        projectId: PROJECT_A,
        workflowRunId: RUN_A,
        jobId: JOB_A,
        agentName: "AlinaArchitect",
        taskKind: "architect_plan",
        sourceRefs: [{ sourceVersionId: "00000000-0000-4000-8000-000000000010", contentSha256: SHA("a"), evidenceFragmentRefs: [] }],
        promptSha256: SHA("prompt"),
        schemaSha256: SHA("schema"),
        policySha256: SHA("policy"),
        modelVersionId: MODEL_VER,
        agentVersionId: AGENT_VER,
        canonicalizationVersion: "canonical-json-v1",
        contextPayloadSha256: SHA("payload"),
        snapshotSha256: snapshotSha,
        authorizationDecisionId: AUTH_DEC,
      });
      snapshotId = row.id;
      await sealContextSnapshot(client, {
        snapshotId: row.id,
        sealedAt: new Date("2026-10-20T12:00:01.000Z"),
        predecessorSnapshotId: null,
      });
    });

    // Reject.
    await withTransaction(appPool, async (client) => {
      await setTenantContext(client, TENANT_A);
      const rejected = await rejectContextSnapshot(client, {
        snapshotId: snapshotId!,
        rejectedAt: new Date("2026-10-20T12:00:03.000Z"),
        rejectReason: "HASH_MISMATCH",
      });
      expect(rejected.snapshot_state).toBe("REJECTED");
      expect(rejected.reject_reason).toBe("HASH_MISMATCH");
    });
  });

  it("idempotent insert — same (tenant, job, snapshot_sha256) returns the same row", async () => {
    const snapshotSha = SHA("snapshot-idempotent");
    let firstId: string;

    await withTransaction(appPool, async (client) => {
      await setTenantContext(client, TENANT_A);
      const row = await insertContextSnapshot(client, {
        tenantId: TENANT_A,
        projectId: PROJECT_A,
        workflowRunId: RUN_A,
        jobId: JOB_A,
        agentName: "AlinaArchitect",
        taskKind: "architect_plan",
        sourceRefs: [{ sourceVersionId: "00000000-0000-4000-8000-000000000010", contentSha256: SHA("a"), evidenceFragmentRefs: [] }],
        promptSha256: SHA("prompt"),
        schemaSha256: SHA("schema"),
        policySha256: SHA("policy"),
        modelVersionId: MODEL_VER,
        agentVersionId: AGENT_VER,
        canonicalizationVersion: "canonical-json-v1",
        contextPayloadSha256: SHA("payload"),
        snapshotSha256: snapshotSha,
        authorizationDecisionId: AUTH_DEC,
      });
      firstId = row.id;
    });

    // Insert again with the same hash — should return the existing row.
    await withTransaction(appPool, async (client) => {
      await setTenantContext(client, TENANT_A);
      const row = await insertContextSnapshot(client, {
        tenantId: TENANT_A,
        projectId: PROJECT_A,
        workflowRunId: RUN_A,
        jobId: JOB_A,
        agentName: "AlinaArchitect",
        taskKind: "architect_plan",
        sourceRefs: [{ sourceVersionId: "00000000-0000-4000-8000-000000000010", contentSha256: SHA("a"), evidenceFragmentRefs: [] }],
        promptSha256: SHA("prompt"),
        schemaSha256: SHA("schema"),
        policySha256: SHA("policy"),
        modelVersionId: MODEL_VER,
        agentVersionId: AGENT_VER,
        canonicalizationVersion: "canonical-json-v1",
        contextPayloadSha256: SHA("payload"),
        snapshotSha256: snapshotSha,
        authorizationDecisionId: AUTH_DEC,
      });
      expect(row.id).toBe(firstId);
    });
  });

  it("SEALED snapshot content fields are immutable (trigger blocks UPDATE)", async () => {
    const snapshotSha = SHA("snapshot-immutable");
    let snapshotId: string;

    // Insert + seal.
    await withTransaction(appPool, async (client) => {
      await setTenantContext(client, TENANT_A);
      const row = await insertContextSnapshot(client, {
        tenantId: TENANT_A,
        projectId: PROJECT_A,
        workflowRunId: RUN_A,
        jobId: JOB_A,
        agentName: "AlinaArchitect",
        taskKind: "architect_plan",
        sourceRefs: [{ sourceVersionId: "00000000-0000-4000-8000-000000000010", contentSha256: SHA("a"), evidenceFragmentRefs: [] }],
        promptSha256: SHA("prompt"),
        schemaSha256: SHA("schema"),
        policySha256: SHA("policy"),
        modelVersionId: MODEL_VER,
        agentVersionId: AGENT_VER,
        canonicalizationVersion: "canonical-json-v1",
        contextPayloadSha256: SHA("payload"),
        snapshotSha256: snapshotSha,
        authorizationDecisionId: AUTH_DEC,
      });
      snapshotId = row.id;
      await sealContextSnapshot(client, {
        snapshotId: row.id,
        sealedAt: new Date("2026-10-20T12:00:01.000Z"),
        predecessorSnapshotId: null,
      });
    });

    // Try to UPDATE a content field on the SEALED row — should fail.
    await expect(
      withTransaction(appPool, async (client) => {
        await setTenantContext(client, TENANT_A);
        await client.query(
          `UPDATE context_snapshots SET prompt_sha256 = $2 WHERE id = $1`,
          [snapshotId!, "f".repeat(64)],
        );
      }),
    ).rejects.toThrow();
  });

  it("CONSUMED snapshot is fully immutable (trigger blocks UPDATE)", async () => {
    const snapshotSha = SHA("snapshot-consumed-immutable");
    let snapshotId: string;

    // Insert + seal + consume.
    await withTransaction(appPool, async (client) => {
      await setTenantContext(client, TENANT_A);
      const row = await insertContextSnapshot(client, {
        tenantId: TENANT_A,
        projectId: PROJECT_A,
        workflowRunId: RUN_A,
        jobId: JOB_A,
        agentName: "AlinaArchitect",
        taskKind: "architect_plan",
        sourceRefs: [{ sourceVersionId: "00000000-0000-4000-8000-000000000010", contentSha256: SHA("a"), evidenceFragmentRefs: [] }],
        promptSha256: SHA("prompt"),
        schemaSha256: SHA("schema"),
        policySha256: SHA("policy"),
        modelVersionId: MODEL_VER,
        agentVersionId: AGENT_VER,
        canonicalizationVersion: "canonical-json-v1",
        contextPayloadSha256: SHA("payload"),
        snapshotSha256: snapshotSha,
        authorizationDecisionId: AUTH_DEC,
      });
      snapshotId = row.id;
      await sealContextSnapshot(client, {
        snapshotId: row.id,
        sealedAt: new Date("2026-10-20T12:00:01.000Z"),
        predecessorSnapshotId: null,
      });
      await consumeContextSnapshot(client, {
        snapshotId: row.id,
        consumedAt: new Date("2026-10-20T12:00:02.000Z"),
        consumedByJobId: JOB_A,
      });
    });

    // Try to UPDATE the CONSUMED row — should fail.
    await expect(
      withTransaction(appPool, async (client) => {
        await setTenantContext(client, TENANT_A);
        await client.query(
          `UPDATE context_snapshots SET task_kind = 'tampered' WHERE id = $1`,
          [snapshotId!],
        );
      }),
    ).rejects.toThrow();
  });
});
