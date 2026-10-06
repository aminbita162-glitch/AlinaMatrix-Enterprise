/**
 * DB layer for M03 plans and drafts.
 *
 * Both tables are insert-once (immutable after creation):
 *   - m03_plans  has UNIQUE (workflow_run_id)
 *   - m03_drafts has UNIQUE (workflow_run_id)
 *
 * Status: Enterprise Candidate — Active Development
 */
import { v4 as uuidv4 } from "uuid";
import type { DbClient } from "./client.js";
import type { M03PlanRow, M03DraftRow } from "@alinamatrix/contracts";

// ============================================================
// Insert M03 plan
// ============================================================

export interface InsertM03PlanParams {
  tenantId:          string;
  projectId:         string;
  workflowRunId:     string;
  agentVersionId:    string;
  promptVersionId:   string;
  schemaVersionId:   string;
  policyVersionId:   string;
  sourceVersionIds:  string[];
  inputHash:         string;
  contentJson:       Record<string, unknown>;
  planHash:          string;
}

export async function insertM03Plan(
  client: DbClient,
  params: InsertM03PlanParams,
): Promise<M03PlanRow> {
  const id = uuidv4();
  const res = await client.query<M03PlanRow>(
    `INSERT INTO m03_plans
       (id, tenant_id, project_id, workflow_run_id,
        agent_version_id, prompt_version_id, schema_version_id, policy_version_id,
        source_version_ids, input_hash, content_json, plan_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (workflow_run_id) DO NOTHING
     RETURNING *`,
    [
      id,
      params.tenantId,
      params.projectId,
      params.workflowRunId,
      params.agentVersionId,
      params.promptVersionId,
      params.schemaVersionId,
      params.policyVersionId,
      params.sourceVersionIds,
      params.inputHash,
      JSON.stringify(params.contentJson),
      params.planHash,
    ],
  );
  // ON CONFLICT DO NOTHING: return existing row when re-run.
  if (res.rows.length === 0) {
    return getM03Plan(client, params.workflowRunId);
  }
  return res.rows[0]!;
}

export async function getM03Plan(
  client: DbClient,
  workflowRunId: string,
): Promise<M03PlanRow> {
  const res = await client.query<M03PlanRow>(
    `SELECT * FROM m03_plans WHERE workflow_run_id = $1`,
    [workflowRunId],
  );
  if (res.rows.length === 0) {
    throw new Error(`M03 plan not found for workflow_run_id: ${workflowRunId}`);
  }
  return res.rows[0]!;
}

// ============================================================
// Insert M03 draft
// ============================================================

export interface InsertM03DraftParams {
  tenantId:          string;
  projectId:         string;
  workflowRunId:     string;
  planId:            string;
  agentVersionId:    string;
  promptVersionId:   string;
  schemaVersionId:   string;
  policyVersionId:   string;
  claimIds:          string[];
  contentJson:       Record<string, unknown>;
  draftHash:         string;
}

export async function insertM03Draft(
  client: DbClient,
  params: InsertM03DraftParams,
): Promise<M03DraftRow> {
  const id = uuidv4();
  const res = await client.query<M03DraftRow>(
    `INSERT INTO m03_drafts
       (id, tenant_id, project_id, workflow_run_id, plan_id,
        agent_version_id, prompt_version_id, schema_version_id, policy_version_id,
        claim_ids, content_json, draft_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (workflow_run_id) DO NOTHING
     RETURNING *`,
    [
      id,
      params.tenantId,
      params.projectId,
      params.workflowRunId,
      params.planId,
      params.agentVersionId,
      params.promptVersionId,
      params.schemaVersionId,
      params.policyVersionId,
      params.claimIds,
      JSON.stringify(params.contentJson),
      params.draftHash,
    ],
  );
  if (res.rows.length === 0) {
    return getM03Draft(client, params.workflowRunId);
  }
  return res.rows[0]!;
}

export async function getM03Draft(
  client: DbClient,
  workflowRunId: string,
): Promise<M03DraftRow> {
  const res = await client.query<M03DraftRow>(
    `SELECT * FROM m03_drafts WHERE workflow_run_id = $1`,
    [workflowRunId],
  );
  if (res.rows.length === 0) {
    throw new Error(`M03 draft not found for workflow_run_id: ${workflowRunId}`);
  }
  return res.rows[0]!;
}
