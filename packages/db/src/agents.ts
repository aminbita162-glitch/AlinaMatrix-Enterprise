/**
 * Database access layer for Phase 5:
 * agents, agent_versions, model_versions, prompt_versions, schema_versions,
 * policy_versions, workflows, workflow_runs, processing_jobs, job_events,
 * agent_runs, usage_events, cache_entries.
 *
 * All tenant-scoped functions require the caller to set tenant context first.
 * Catalog tables (agents, model_versions, etc.) are not tenant-scoped.
 *
 * Status: Enterprise Candidate — Active Development
 */
import type pg from "pg";
import { assertLegalTransition } from "@alinamatrix/domain";
import type { WorkflowState } from "@alinamatrix/domain";

// ============================================================
// Row types
// ============================================================

export interface AgentRow {
  id:           string;
  name:         string;
  capabilities: string[];
  description:  string | null;
  created_at:   Date;
  updated_at:   Date;
}

export interface ModelVersionRow {
  id:          string;
  model_id:    string;
  provider:    string;
  temperature: string; // pg numeric as string
  max_tokens:  number | null;
  description: string | null;
  created_at:  Date;
}

export interface PromptVersionRow {
  id:         string;
  name:       string;
  version:    number;
  text:       string;
  sha256:     string;
  created_at: Date;
}

export interface SchemaVersionRow {
  id:          string;
  name:        string;
  version:     number;
  schema_json: Record<string, unknown>;
  sha256:      string;
  created_at:  Date;
}

export interface PolicyVersionRow {
  id:          string;
  name:        string;
  version:     number;
  rules_json:  Record<string, unknown>;
  sha256:      string;
  created_at:  Date;
}

export interface AgentVersionRow {
  id:                 string;
  agent_id:           string;
  version:            number;
  model_version_id:   string;
  prompt_version_id:  string;
  schema_version_id:  string;
  policy_version_id:  string;
  created_at:         Date;
}

export interface WorkflowRow {
  id:          string;
  tenant_id:   string;
  project_id:  string;
  name:        string;
  description: string | null;
  created_at:  Date;
  updated_at:  Date;
}

export interface WorkflowRunRow {
  id:          string;
  tenant_id:   string;
  workflow_id: string;
  state:       WorkflowState;
  created_at:  Date;
  updated_at:  Date;
}

export interface ProcessingJobRow {
  id:                string;
  tenant_id:         string;
  workflow_run_id:   string;
  agent_version_id:  string | null;
  idempotency_key:   string;
  state:             WorkflowState;
  created_at:        Date;
  updated_at:        Date;
}

export interface JobEventRow {
  id:         string;
  tenant_id:  string;
  job_id:     string;
  from_state: WorkflowState;
  to_state:   WorkflowState;
  reason:     string | null;
  created_at: Date;
}

export interface AgentRunRow {
  id:                string;
  tenant_id:         string;
  job_id:            string;
  agent_version_id:  string;
  input_hash:        string;
  output_json:       Record<string, unknown> | null;
  state:             "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  fail_reason:       string | null;
  created_at:        Date;
  updated_at:        Date;
}

export interface UsageEventRow {
  id:                 string;
  tenant_id:          string;
  project_id:         string;
  agent_run_id:       string;
  agent_version_id:   string;
  model_version_id:   string;
  prompt_tokens:      number;
  completion_tokens:  number;
  total_tokens:       number;
  cost_minor_units:   string; // pg bigint as string
  created_at:         Date;
}

export interface CacheEntryRow {
  id:                 string;
  tenant_id:          string;
  cache_key:          string;
  output_json:        Record<string, unknown>;
  prompt_version_id:  string;
  model_version_id:   string;
  schema_version_id:  string;
  policy_version_id:  string;
  created_at:         Date;
}

// ============================================================
// Agents (catalog — not tenant-scoped)
// ============================================================

export async function getAgent(
  client: pg.PoolClient,
  agentId: string,
): Promise<AgentRow | null> {
  const res = await client.query<AgentRow>(
    "SELECT * FROM agents WHERE id = $1",
    [agentId],
  );
  return res.rows[0] ?? null;
}

export async function getAgentByName(
  client: pg.PoolClient,
  name: string,
): Promise<AgentRow | null> {
  const res = await client.query<AgentRow>(
    "SELECT * FROM agents WHERE name = $1",
    [name],
  );
  return res.rows[0] ?? null;
}

export async function listAgents(
  client: pg.PoolClient,
): Promise<AgentRow[]> {
  const res = await client.query<AgentRow>(
    "SELECT * FROM agents ORDER BY name ASC",
  );
  return res.rows;
}

// ============================================================
// Model versions (catalog)
// ============================================================

export async function insertModelVersion(
  client: pg.PoolClient,
  params: {
    modelId:     string;
    provider:    string;
    temperature: number;
    maxTokens?:  number | null;
    description?: string | null;
  },
): Promise<ModelVersionRow> {
  const res = await client.query<ModelVersionRow>(
    `INSERT INTO model_versions (model_id, provider, temperature, max_tokens, description)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (model_id, provider) DO UPDATE
       SET description = EXCLUDED.description
     RETURNING *`,
    [
      params.modelId,
      params.provider,
      params.temperature,
      params.maxTokens ?? null,
      params.description ?? null,
    ],
  );
  return res.rows[0]!;
}

export async function getModelVersion(
  client: pg.PoolClient,
  id: string,
): Promise<ModelVersionRow | null> {
  const res = await client.query<ModelVersionRow>(
    "SELECT * FROM model_versions WHERE id = $1",
    [id],
  );
  return res.rows[0] ?? null;
}

// ============================================================
// Prompt versions (catalog)
// ============================================================

export async function insertPromptVersion(
  client: pg.PoolClient,
  params: {
    name:    string;
    version: number;
    text:    string;
    sha256:  string;
  },
): Promise<PromptVersionRow> {
  const res = await client.query<PromptVersionRow>(
    `INSERT INTO prompt_versions (name, version, text, sha256)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (sha256) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [params.name, params.version, params.text, params.sha256],
  );
  return res.rows[0]!;
}

export async function getPromptVersion(
  client: pg.PoolClient,
  id: string,
): Promise<PromptVersionRow | null> {
  const res = await client.query<PromptVersionRow>(
    "SELECT * FROM prompt_versions WHERE id = $1",
    [id],
  );
  return res.rows[0] ?? null;
}

// ============================================================
// Schema versions (catalog)
// ============================================================

export async function insertSchemaVersion(
  client: pg.PoolClient,
  params: {
    name:       string;
    version:    number;
    schemaJson: Record<string, unknown>;
    sha256:     string;
  },
): Promise<SchemaVersionRow> {
  const res = await client.query<SchemaVersionRow>(
    `INSERT INTO schema_versions (name, version, schema_json, sha256)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (sha256) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [params.name, params.version, params.schemaJson, params.sha256],
  );
  return res.rows[0]!;
}

export async function getSchemaVersion(
  client: pg.PoolClient,
  id: string,
): Promise<SchemaVersionRow | null> {
  const res = await client.query<SchemaVersionRow>(
    "SELECT * FROM schema_versions WHERE id = $1",
    [id],
  );
  return res.rows[0] ?? null;
}

// ============================================================
// Policy versions (catalog)
// ============================================================

export async function insertPolicyVersion(
  client: pg.PoolClient,
  params: {
    name:      string;
    version:   number;
    rulesJson: Record<string, unknown>;
    sha256:    string;
  },
): Promise<PolicyVersionRow> {
  const res = await client.query<PolicyVersionRow>(
    `INSERT INTO policy_versions (name, version, rules_json, sha256)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (sha256) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [params.name, params.version, params.rulesJson, params.sha256],
  );
  return res.rows[0]!;
}

export async function getPolicyVersion(
  client: pg.PoolClient,
  id: string,
): Promise<PolicyVersionRow | null> {
  const res = await client.query<PolicyVersionRow>(
    "SELECT * FROM policy_versions WHERE id = $1",
    [id],
  );
  return res.rows[0] ?? null;
}

// ============================================================
// Agent versions (catalog)
// ============================================================

export async function insertAgentVersion(
  client: pg.PoolClient,
  params: {
    agentId:          string;
    version:          number;
    modelVersionId:   string;
    promptVersionId:  string;
    schemaVersionId:  string;
    policyVersionId:  string;
  },
): Promise<AgentVersionRow> {
  const res = await client.query<AgentVersionRow>(
    `INSERT INTO agent_versions
       (agent_id, version, model_version_id, prompt_version_id, schema_version_id, policy_version_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      params.agentId,
      params.version,
      params.modelVersionId,
      params.promptVersionId,
      params.schemaVersionId,
      params.policyVersionId,
    ],
  );
  return res.rows[0]!;
}

export async function getAgentVersion(
  client: pg.PoolClient,
  id: string,
): Promise<AgentVersionRow | null> {
  const res = await client.query<AgentVersionRow>(
    "SELECT * FROM agent_versions WHERE id = $1",
    [id],
  );
  return res.rows[0] ?? null;
}

// ============================================================
// Workflows (tenant-scoped)
// ============================================================

export async function insertWorkflow(
  client: pg.PoolClient,
  params: {
    tenantId:    string;
    projectId:   string;
    name:        string;
    description?: string | null;
  },
): Promise<WorkflowRow> {
  const res = await client.query<WorkflowRow>(
    `INSERT INTO workflows (tenant_id, project_id, name, description)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.tenantId, params.projectId, params.name, params.description ?? null],
  );
  return res.rows[0]!;
}

export async function getWorkflow(
  client: pg.PoolClient,
  workflowId: string,
): Promise<WorkflowRow | null> {
  const res = await client.query<WorkflowRow>(
    "SELECT * FROM workflows WHERE id = $1",
    [workflowId],
  );
  return res.rows[0] ?? null;
}

// ============================================================
// Workflow runs (tenant-scoped)
// ============================================================

export async function insertWorkflowRun(
  client: pg.PoolClient,
  params: {
    tenantId:   string;
    workflowId: string;
  },
): Promise<WorkflowRunRow> {
  const res = await client.query<WorkflowRunRow>(
    `INSERT INTO workflow_runs (tenant_id, workflow_id)
     VALUES ($1, $2)
     RETURNING *`,
    [params.tenantId, params.workflowId],
  );
  return res.rows[0]!;
}

export async function getWorkflowRun(
  client: pg.PoolClient,
  runId: string,
): Promise<WorkflowRunRow | null> {
  const res = await client.query<WorkflowRunRow>(
    "SELECT * FROM workflow_runs WHERE id = $1",
    [runId],
  );
  return res.rows[0] ?? null;
}

export async function transitionWorkflowRunState(
  client: pg.PoolClient,
  runId: string,
  fromState: WorkflowState,
  toState: WorkflowState,
): Promise<void> {
  // Domain guard: throws IllegalTransitionError for illegal jumps.
  assertLegalTransition(fromState, toState);
  await client.query(
    `UPDATE workflow_runs SET state = $1, updated_at = now() WHERE id = $2`,
    [toState, runId],
  );
}

// ============================================================
// Processing jobs (tenant-scoped)
// ============================================================

/**
 * Insert a new processing job.
 *
 * Idempotency: if (workflow_run_id, idempotency_key) already exists,
 * returns the existing row with deduplicated = true.
 */
export async function insertJob(
  client: pg.PoolClient,
  params: {
    tenantId:        string;
    workflowRunId:   string;
    agentVersionId?: string | null;
    idempotencyKey:  string;
  },
): Promise<{ row: ProcessingJobRow; deduplicated: boolean }> {
  const existing = await client.query<ProcessingJobRow>(
    `SELECT * FROM processing_jobs
     WHERE workflow_run_id = $1 AND idempotency_key = $2`,
    [params.workflowRunId, params.idempotencyKey],
  );
  if (existing.rows.length > 0) {
    return { row: existing.rows[0]!, deduplicated: true };
  }

  const res = await client.query<ProcessingJobRow>(
    `INSERT INTO processing_jobs
       (tenant_id, workflow_run_id, agent_version_id, idempotency_key)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      params.tenantId,
      params.workflowRunId,
      params.agentVersionId ?? null,
      params.idempotencyKey,
    ],
  );
  return { row: res.rows[0]!, deduplicated: false };
}

export async function getJob(
  client: pg.PoolClient,
  jobId: string,
): Promise<ProcessingJobRow | null> {
  const res = await client.query<ProcessingJobRow>(
    "SELECT * FROM processing_jobs WHERE id = $1",
    [jobId],
  );
  return res.rows[0] ?? null;
}

/**
 * Transition a job to a new state.
 * Validates the transition via the domain assertLegalTransition guard.
 * Appends a job_event row atomically.
 *
 * A CANCELLED job cannot be advanced; the caller should check
 * assertJobNotCancelled before calling this.
 */
export async function transitionJobState(
  client: pg.PoolClient,
  jobId: string,
  tenantId: string,
  fromState: WorkflowState,
  toState: WorkflowState,
  reason?: string | null,
): Promise<void> {
  // Domain guard: throws IllegalTransitionError for illegal jumps.
  assertLegalTransition(fromState, toState);

  await client.query(
    `UPDATE processing_jobs SET state = $1, updated_at = now() WHERE id = $2`,
    [toState, jobId],
  );

  await client.query(
    `INSERT INTO job_events (tenant_id, job_id, from_state, to_state, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, jobId, fromState, toState, reason ?? null],
  );
}

// ============================================================
// Job events (tenant-scoped, append-only)
// ============================================================

export async function appendJobEvent(
  client: pg.PoolClient,
  params: {
    tenantId:  string;
    jobId:     string;
    fromState: WorkflowState;
    toState:   WorkflowState;
    reason?:   string | null;
  },
): Promise<JobEventRow> {
  const res = await client.query<JobEventRow>(
    `INSERT INTO job_events (tenant_id, job_id, from_state, to_state, reason)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      params.tenantId,
      params.jobId,
      params.fromState,
      params.toState,
      params.reason ?? null,
    ],
  );
  return res.rows[0]!;
}

export async function listJobEvents(
  client: pg.PoolClient,
  jobId: string,
): Promise<JobEventRow[]> {
  const res = await client.query<JobEventRow>(
    "SELECT * FROM job_events WHERE job_id = $1 ORDER BY created_at ASC",
    [jobId],
  );
  return res.rows;
}

// ============================================================
// Agent runs (tenant-scoped)
// ============================================================

export async function insertAgentRun(
  client: pg.PoolClient,
  params: {
    tenantId:        string;
    jobId:           string;
    agentVersionId:  string;
    inputHash:       string;
  },
): Promise<AgentRunRow> {
  const res = await client.query<AgentRunRow>(
    `INSERT INTO agent_runs (tenant_id, job_id, agent_version_id, input_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.tenantId, params.jobId, params.agentVersionId, params.inputHash],
  );
  return res.rows[0]!;
}

export async function completeAgentRun(
  client: pg.PoolClient,
  agentRunId: string,
  params: {
    outputJson: Record<string, unknown>;
    state:      "SUCCEEDED" | "FAILED";
    failReason?: string | null;
  },
): Promise<void> {
  await client.query(
    `UPDATE agent_runs
     SET output_json = $1, state = $2, fail_reason = $3, updated_at = now()
     WHERE id = $4`,
    [params.outputJson, params.state, params.failReason ?? null, agentRunId],
  );
}

export async function getAgentRun(
  client: pg.PoolClient,
  agentRunId: string,
): Promise<AgentRunRow | null> {
  const res = await client.query<AgentRunRow>(
    "SELECT * FROM agent_runs WHERE id = $1",
    [agentRunId],
  );
  return res.rows[0] ?? null;
}

// ============================================================
// Usage events (tenant-scoped)
// ============================================================

export async function insertUsageEvent(
  client: pg.PoolClient,
  params: {
    tenantId:          string;
    projectId:         string;
    agentRunId:        string;
    agentVersionId:    string;
    modelVersionId:    string;
    promptTokens:      number;
    completionTokens:  number;
    costMinorUnits:    number;
  },
): Promise<UsageEventRow> {
  const res = await client.query<UsageEventRow>(
    `INSERT INTO usage_events
       (tenant_id, project_id, agent_run_id, agent_version_id, model_version_id,
        prompt_tokens, completion_tokens, cost_minor_units)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      params.tenantId,
      params.projectId,
      params.agentRunId,
      params.agentVersionId,
      params.modelVersionId,
      params.promptTokens,
      params.completionTokens,
      params.costMinorUnits,
    ],
  );
  return res.rows[0]!;
}

export async function listUsageEventsByJob(
  client: pg.PoolClient,
  jobId: string,
): Promise<UsageEventRow[]> {
  const res = await client.query<UsageEventRow>(
    `SELECT ue.*
     FROM usage_events ue
     JOIN agent_runs ar ON ar.id = ue.agent_run_id
     WHERE ar.job_id = $1
     ORDER BY ue.created_at ASC`,
    [jobId],
  );
  return res.rows;
}

export async function listUsageEventsByProject(
  client: pg.PoolClient,
  projectId: string,
): Promise<UsageEventRow[]> {
  const res = await client.query<UsageEventRow>(
    `SELECT * FROM usage_events WHERE project_id = $1 ORDER BY created_at ASC`,
    [projectId],
  );
  return res.rows;
}

// ============================================================
// Cache entries (tenant-scoped)
// ============================================================

/**
 * Attempt to retrieve a cache entry by key.
 * Returns null on a cache miss.
 *
 * Because cache_key includes tenant_id in its SHA-256 preimage,
 * a cross-tenant hit is structurally impossible.
 */
export async function getCacheEntry(
  client: pg.PoolClient,
  cacheKey: string,
): Promise<CacheEntryRow | null> {
  const res = await client.query<CacheEntryRow>(
    "SELECT * FROM cache_entries WHERE cache_key = $1",
    [cacheKey],
  );
  return res.rows[0] ?? null;
}

/**
 * Insert a new cache entry.
 * On conflict (same cache_key) the existing row is returned unchanged.
 */
export async function insertCacheEntry(
  client: pg.PoolClient,
  params: {
    tenantId:          string;
    cacheKey:          string;
    outputJson:        Record<string, unknown>;
    promptVersionId:   string;
    modelVersionId:    string;
    schemaVersionId:   string;
    policyVersionId:   string;
  },
): Promise<CacheEntryRow> {
  const res = await client.query<CacheEntryRow>(
    `INSERT INTO cache_entries
       (tenant_id, cache_key, output_json,
        prompt_version_id, model_version_id, schema_version_id, policy_version_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (cache_key) DO UPDATE SET cache_key = EXCLUDED.cache_key
     RETURNING *`,
    [
      params.tenantId,
      params.cacheKey,
      params.outputJson,
      params.promptVersionId,
      params.modelVersionId,
      params.schemaVersionId,
      params.policyVersionId,
    ],
  );
  return res.rows[0]!;
}

/**
 * Get or insert a cache entry.
 * Returns { row, hit: true } on cache hit; { row, hit: false } on miss (inserted).
 */
export async function getOrInsertCacheEntry(
  client: pg.PoolClient,
  params: {
    tenantId:          string;
    cacheKey:          string;
    outputJson:        Record<string, unknown>;
    promptVersionId:   string;
    modelVersionId:    string;
    schemaVersionId:   string;
    policyVersionId:   string;
  },
): Promise<{ row: CacheEntryRow; hit: boolean }> {
  const existing = await getCacheEntry(client, params.cacheKey);
  if (existing) {
    return { row: existing, hit: true };
  }
  const row = await insertCacheEntry(client, params);
  return { row, hit: false };
}
