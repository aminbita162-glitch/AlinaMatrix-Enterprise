/**
 * DB layer for context snapshots — ECIDR (Verifiable Evidence Context Integrity
 * & Deterministic Replay).
 *
 * Table: context_snapshots (append-only for SEALED/CONSUMED/REJECTED states).
 *
 * Immutability:
 *   - SEALED, CONSUMED, and REJECTED rows are immutable — triggers reject
 *     UPDATE and DELETE (migration 015).
 *   - PREPARED rows may be updated to SEALED, but once sealed they are frozen.
 *   - The snapshot hash and payload hash are computed by the domain layer
 *     (computeContextPayloadSha256, computeSnapshotSha256) and stored as
 *     columns; the DB does not recompute them.
 *
 * Directive ECIDR §08:
 *   "PostgreSQL remains authoritative. Reuse withTransaction and
 *    transaction-local tenant context. Verify every new tenant-scoped table
 *    has RLS with deny-by-default behavior."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { v4 as uuidv4 } from "uuid";
import type { DbClient } from "./client.js";

// ============================================================
// Row types
// ============================================================

export interface ContextSnapshotRow {
  id:                          string;
  tenant_id:                   string;
  project_id:                  string;
  workflow_run_id:             string;
  job_id:                      string;
  agent_name:                  string;
  task_kind:                   string;
  source_refs:                 unknown; // jsonb
  prompt_sha256:               string;
  schema_sha256:               string;
  policy_sha256:               string;
  model_version_id:            string;
  agent_version_id:            string;
  canonicalization_version:   string;
  context_payload_sha256:      string;
  snapshot_sha256:             string;
  authorization_decision_id:   string;
  snapshot_state:              string;
  sealed_at:                   Date | null;
  predecessor_snapshot_id:     string | null;
  consumed_at:                  Date | null;
  consumed_by_job_id:           string | null;
  rejected_at:                  Date | null;
  reject_reason:                string | null;
  created_at:                   Date;
}

// ============================================================
// INSERT (PREPARED state)
// ============================================================

export interface InsertContextSnapshotParams {
  tenantId:                    string;
  projectId:                   string;
  workflowRunId:               string;
  jobId:                        string;
  agentName:                   string;
  taskKind:                    string;
  sourceRefs:                  unknown; // JSON-serializable
  promptSha256:                string;
  schemaSha256:                string;
  policySha256:                string;
  modelVersionId:              string;
  agentVersionId:             string;
  canonicalizationVersion:   string;
  contextPayloadSha256:       string;
  snapshotSha256:              string;
  authorizationDecisionId:    string;
}

/**
 * Insert a new context snapshot in the PREPARED state.
 *
 * Idempotent: the UNIQUE (tenant_id, job_id, snapshot_sha256) constraint
 * prevents duplicate snapshots for the same tenant/job/hash combination.
 * If the snapshot already exists, the existing row is returned.
 */
export async function insertContextSnapshot(
  client: DbClient,
  params: InsertContextSnapshotParams,
): Promise<ContextSnapshotRow> {
  const id = uuidv4();
  // Use a savepoint so we can rollback the failed INSERT and retry the SELECT
  // without aborting the outer transaction.
  await client.query("SAVEPOINT ecidr_insert");
  try {
    const res = await client.query<ContextSnapshotRow>(
      `INSERT INTO context_snapshots
         (id, tenant_id, project_id, workflow_run_id, job_id,
          agent_name, task_kind, source_refs,
          prompt_sha256, schema_sha256, policy_sha256,
          model_version_id, agent_version_id, canonicalization_version,
          context_payload_sha256, snapshot_sha256, authorization_decision_id,
          snapshot_state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'PREPARED')
       RETURNING *`,
      [
        id,
        params.tenantId,
        params.projectId,
        params.workflowRunId,
        params.jobId,
        params.agentName,
        params.taskKind,
        JSON.stringify(params.sourceRefs),
        params.promptSha256,
        params.schemaSha256,
        params.policySha256,
        params.modelVersionId,
        params.agentVersionId,
        params.canonicalizationVersion,
        params.contextPayloadSha256,
        params.snapshotSha256,
        params.authorizationDecisionId,
      ],
    );
    await client.query("RELEASE SAVEPOINT ecidr_insert");
    return res.rows[0]!;
  } catch (err: unknown) {
    // Rollback to the savepoint on unique constraint violation, then fetch.
    await client.query("ROLLBACK TO SAVEPOINT ecidr_insert");
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      const existing = await client.query<ContextSnapshotRow>(
        `SELECT * FROM context_snapshots
         WHERE tenant_id = $1 AND job_id = $2 AND snapshot_sha256 = $3
         LIMIT 1`,
        [params.tenantId, params.jobId, params.snapshotSha256],
      );
      return existing.rows[0]!;
    }
    throw err;
  }
}

// ============================================================
// SEAL — transition PREPARED -> SEALED
// ============================================================

export interface SealContextSnapshotParams {
  snapshotId:    string;
  sealedAt:      Date;
  predecessorSnapshotId: string | null;
}

/**
 * Seal a PREPARED context snapshot — transition to SEALED.
 *
 * The trigger allows UPDATE on PREPARED rows but blocks UPDATE on
 * SEALED/CONSUMED/REJECTED rows.
 *
 * @throws when the snapshot is not in PREPARED state (the trigger blocks
 *   the UPDATE, or the row doesn't exist).
 */
export async function sealContextSnapshot(
  client: DbClient,
  params: SealContextSnapshotParams,
): Promise<ContextSnapshotRow> {
  const res = await client.query<ContextSnapshotRow>(
    `UPDATE context_snapshots
     SET snapshot_state = 'SEALED',
         sealed_at = $2,
         predecessor_snapshot_id = $3
     WHERE id = $1 AND snapshot_state = 'PREPARED'
     RETURNING *`,
    [params.snapshotId, params.sealedAt, params.predecessorSnapshotId],
  );
  if (res.rows.length === 0) {
    // Either the row doesn't exist or it's not in PREPARED state.
    throw new Error(
      `Cannot seal context snapshot ${params.snapshotId}: not found or not in PREPARED state`,
    );
  }
  return res.rows[0]!;
}

// ============================================================
// CONSUME — transition SEALED -> CONSUMED
// ============================================================

export interface ConsumeContextSnapshotParams {
  snapshotId:       string;
  consumedAt:       Date;
  consumedByJobId:  string;
}

/**
 * Consume a SEALED context snapshot — transition to CONSUMED.
 *
 * Directive ECIDR §07:
 *   "CONSUMED records which agent/job consumed which sealed snapshot."
 *
 * The trigger allows UPDATE on SEALED rows only when the content fields are
 * unchanged and the new state is CONSUMED or REJECTED.
 *
 * @throws when the snapshot is not in SEALED state.
 */
export async function consumeContextSnapshot(
  client: DbClient,
  params: ConsumeContextSnapshotParams,
): Promise<ContextSnapshotRow> {
  const res = await client.query<ContextSnapshotRow>(
    `UPDATE context_snapshots
     SET snapshot_state = 'CONSUMED',
         consumed_at = $2,
         consumed_by_job_id = $3
     WHERE id = $1 AND snapshot_state = 'SEALED'
     RETURNING *`,
    [params.snapshotId, params.consumedAt, params.consumedByJobId],
  );
  if (res.rows.length === 0) {
    throw new Error(
      `Cannot consume context snapshot ${params.snapshotId}: not found or not in SEALED state`,
    );
  }
  return res.rows[0]!;
}

// ============================================================
// REJECT — transition SEALED -> REJECTED
// ============================================================

export interface RejectContextSnapshotParams {
  snapshotId:    string;
  rejectedAt:   Date;
  rejectReason: string;
}

/**
 * Reject a SEALED context snapshot — transition to REJECTED.
 *
 * Directive ECIDR §07:
 *   "REJECTED records a safe reason code."
 *
 * @throws when the snapshot is not in SEALED state.
 */
export async function rejectContextSnapshot(
  client: DbClient,
  params: RejectContextSnapshotParams,
): Promise<ContextSnapshotRow> {
  const res = await client.query<ContextSnapshotRow>(
    `UPDATE context_snapshots
     SET snapshot_state = 'REJECTED',
         rejected_at = $2,
         reject_reason = $3
     WHERE id = $1 AND snapshot_state = 'SEALED'
     RETURNING *`,
    [params.snapshotId, params.rejectedAt, params.rejectReason],
  );
  if (res.rows.length === 0) {
    throw new Error(
      `Cannot reject context snapshot ${params.snapshotId}: not found or not in SEALED state`,
    );
  }
  return res.rows[0]!;
}

// ============================================================
// GET — retrieve a snapshot by id
// ============================================================

/**
 * Retrieve a context snapshot by id within the current tenant context.
 * Returns null when not found (RLS excluded or missing).
 */
export async function getContextSnapshot(
  client: DbClient,
  snapshotId: string,
): Promise<ContextSnapshotRow | null> {
  const res = await client.query<ContextSnapshotRow>(
    "SELECT * FROM context_snapshots WHERE id = $1",
    [snapshotId],
  );
  return res.rows[0] ?? null;
}

/**
 * Retrieve a context snapshot by its snapshot hash (the deterministic digest).
 */
export async function getContextSnapshotByHash(
  client: DbClient,
  tenantId: string,
  snapshotSha256: string,
): Promise<ContextSnapshotRow | null> {
  const res = await client.query<ContextSnapshotRow>(
    `SELECT * FROM context_snapshots
     WHERE tenant_id = $1 AND snapshot_sha256 = $2
     LIMIT 1`,
    [tenantId, snapshotSha256],
  );
  return res.rows[0] ?? null;
}

/**
 * List all context snapshots for a job, ordered by created_at.
 */
export async function listContextSnapshotsByJob(
  client: DbClient,
  jobId: string,
): Promise<ContextSnapshotRow[]> {
  const res = await client.query<ContextSnapshotRow>(
    `SELECT * FROM context_snapshots WHERE job_id = $1 ORDER BY created_at ASC`,
    [jobId],
  );
  return res.rows;
}

/**
 * List all context snapshots for a workflow run, ordered by created_at.
 */
export async function listContextSnapshotsByRun(
  client: DbClient,
  workflowRunId: string,
): Promise<ContextSnapshotRow[]> {
  const res = await client.query<ContextSnapshotRow>(
    `SELECT * FROM context_snapshots WHERE workflow_run_id = $1 ORDER BY created_at ASC`,
    [workflowRunId],
  );
  return res.rows;
}
