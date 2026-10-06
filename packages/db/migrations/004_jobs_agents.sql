-- Migration 004: Jobs, Agents, Workflows, Fake Provider Tables
-- AlinaMatrix Enterprise — Enterprise Candidate — Active Development
-- Forward-only. Do not modify after deployment.

BEGIN;

-- ============================================================
-- MODEL VERSIONS
-- Pinned model identifier + generation parameters.
-- ============================================================
CREATE TABLE model_versions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id         text        NOT NULL,
  provider         text        NOT NULL DEFAULT 'deterministic_fake',
  temperature      numeric(3,2) NOT NULL DEFAULT 0.00
                               CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens       integer,
  description      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_id, provider)
);

-- ============================================================
-- PROMPT VERSIONS
-- Immutable prompt text rows.  Content-addressed by sha256.
-- ============================================================
CREATE TABLE prompt_versions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  version      integer     NOT NULL,
  text         text        NOT NULL,
  sha256       text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version),
  UNIQUE (sha256)
);

-- ============================================================
-- SCHEMA VERSIONS
-- Pinned output JSON schema for an agent call.
-- ============================================================
CREATE TABLE schema_versions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  version      integer     NOT NULL,
  schema_json  jsonb       NOT NULL,
  sha256       text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version),
  UNIQUE (sha256)
);

-- ============================================================
-- POLICY VERSIONS
-- Pinned policy rules applied to agent output validation.
-- ============================================================
CREATE TABLE policy_versions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  version      integer     NOT NULL,
  rules_json   jsonb       NOT NULL,
  sha256       text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version),
  UNIQUE (sha256)
);

-- ============================================================
-- AGENTS
-- Four agents only: AlinaArchitect, AlinaGuard,
-- AlinaDocEngine, AlinaOptimizer.
-- capabilities is an array of strings.
-- ============================================================
CREATE TABLE agents (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL UNIQUE,
  capabilities   text[]      NOT NULL DEFAULT '{}',
  description    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- AGENT VERSIONS
-- Snapshot of an agent pinned to specific model/prompt/schema/policy.
-- ============================================================
CREATE TABLE agent_versions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id           uuid        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version            integer     NOT NULL,
  model_version_id   uuid        NOT NULL REFERENCES model_versions(id),
  prompt_version_id  uuid        NOT NULL REFERENCES prompt_versions(id),
  schema_version_id  uuid        NOT NULL REFERENCES schema_versions(id),
  policy_version_id  uuid        NOT NULL REFERENCES policy_versions(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, version)
);

-- ============================================================
-- WORKFLOWS
-- A workflow definition belongs to a tenant + project.
-- ============================================================
CREATE TABLE workflows (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id   uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- WORKFLOW RUNS
-- One run per invocation of a workflow.
-- ============================================================
CREATE TABLE workflow_runs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_id    uuid        NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  state          text        NOT NULL DEFAULT 'INGESTED'
                             CHECK (state IN (
                               'INGESTED','CLASSIFIED','EXTRACTED','EVIDENCE_READY',
                               'ARCHITECTED','GENERATED','VALIDATING','NEEDS_REVIEW',
                               'APPROVED','BUILDING','BUILT','RELEASED',
                               'FAILED_RETRYABLE','FAILED_TERMINAL',
                               'CANCELLED','EXPIRED','QUARANTINED'
                             )),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PROCESSING JOBS
-- Each job is an idempotent unit of work.
-- Duplicate idempotency_key for the same workflow_run is rejected.
-- ============================================================
CREATE TABLE processing_jobs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_run_id   uuid        NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  agent_version_id  uuid        REFERENCES agent_versions(id),
  idempotency_key   text        NOT NULL,
  state             text        NOT NULL DEFAULT 'INGESTED'
                                CHECK (state IN (
                                  'INGESTED','CLASSIFIED','EXTRACTED','EVIDENCE_READY',
                                  'ARCHITECTED','GENERATED','VALIDATING','NEEDS_REVIEW',
                                  'APPROVED','BUILDING','BUILT','RELEASED',
                                  'FAILED_RETRYABLE','FAILED_TERMINAL',
                                  'CANCELLED','EXPIRED','QUARANTINED'
                                )),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Idempotency: one job per (workflow_run_id, idempotency_key)
  UNIQUE (workflow_run_id, idempotency_key)
);

-- ============================================================
-- JOB EVENTS
-- Immutable append-only log of state transitions for a job.
-- ============================================================
CREATE TABLE job_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id        uuid        NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
  from_state    text        NOT NULL,
  to_state      text        NOT NULL,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Prevent update/delete on job_events (append-only audit).
CREATE RULE job_events_no_update AS ON UPDATE TO job_events DO INSTEAD NOTHING;
CREATE RULE job_events_no_delete AS ON DELETE TO job_events DO INSTEAD NOTHING;

-- ============================================================
-- AGENT RUNS
-- One row per agent invocation within a job.
-- ============================================================
CREATE TABLE agent_runs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id            uuid        NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
  agent_version_id  uuid        NOT NULL REFERENCES agent_versions(id),
  input_hash        text        NOT NULL,
  output_json       jsonb,
  state             text        NOT NULL DEFAULT 'PENDING'
                                CHECK (state IN ('PENDING','RUNNING','SUCCEEDED','FAILED')),
  fail_reason       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- USAGE EVENTS
-- One row per fake-provider call.
-- tenant, project, agent, model version, token counts, cost_minor_units.
-- ============================================================
CREATE TABLE usage_events (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_run_id        uuid        NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  agent_version_id    uuid        NOT NULL REFERENCES agent_versions(id),
  model_version_id    uuid        NOT NULL REFERENCES model_versions(id),
  prompt_tokens       integer     NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens   integer     NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  total_tokens        integer     NOT NULL GENERATED ALWAYS AS (prompt_tokens + completion_tokens) STORED,
  -- cost in minor currency units (e.g. micro-dollars) to keep integer arithmetic
  cost_minor_units    bigint      NOT NULL DEFAULT 0 CHECK (cost_minor_units >= 0),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- CACHE ENTRIES
-- Deterministic fake-provider output cached by a composite key.
-- cache_key MUST include tenant_id so cross-tenant hits are impossible.
-- ============================================================
CREATE TABLE cache_entries (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- SHA-256 of: tenant_id || source_version_ids || prompt_sha256 || model_id || schema_sha256 || policy_sha256
  cache_key           text        NOT NULL UNIQUE,
  output_json         jsonb       NOT NULL,
  prompt_version_id   uuid        NOT NULL REFERENCES prompt_versions(id),
  model_version_id    uuid        NOT NULL REFERENCES model_versions(id),
  schema_version_id   uuid        NOT NULL REFERENCES schema_versions(id),
  policy_version_id   uuid        NOT NULL REFERENCES policy_versions(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON workflows          (tenant_id);
CREATE INDEX ON workflows          (project_id);
CREATE INDEX ON workflow_runs      (tenant_id);
CREATE INDEX ON workflow_runs      (workflow_id);
CREATE INDEX ON processing_jobs    (tenant_id);
CREATE INDEX ON processing_jobs    (workflow_run_id);
CREATE INDEX ON processing_jobs    (state);
CREATE INDEX ON job_events         (tenant_id);
CREATE INDEX ON job_events         (job_id);
CREATE INDEX ON agent_runs         (tenant_id);
CREATE INDEX ON agent_runs         (job_id);
CREATE INDEX ON usage_events       (tenant_id);
CREATE INDEX ON usage_events       (project_id);
CREATE INDEX ON usage_events       (agent_run_id);
CREATE INDEX ON cache_entries      (tenant_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE workflows       ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_entries   ENABLE ROW LEVEL SECURITY;

ALTER TABLE workflows       FORCE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs   FORCE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE job_events      FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_runs      FORCE ROW LEVEL SECURITY;
ALTER TABLE usage_events    FORCE ROW LEVEL SECURITY;
ALTER TABLE cache_entries   FORCE ROW LEVEL SECURITY;

-- No RLS needed on agents/agent_versions/model_versions/prompt_versions/
-- schema_versions/policy_versions — these are global catalog tables.

CREATE POLICY workflows_tenant   ON workflows       FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY workflow_runs_tenant ON workflow_runs FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY processing_jobs_tenant ON processing_jobs FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY job_events_tenant  ON job_events     FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY agent_runs_tenant  ON agent_runs     FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY usage_events_tenant ON usage_events  FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY cache_entries_tenant ON cache_entries FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ============================================================
-- GRANTS
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON model_versions   TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON prompt_versions  TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON schema_versions  TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON policy_versions  TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON agents           TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON agent_versions   TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON workflows        TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON workflow_runs    TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON processing_jobs  TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON job_events       TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON agent_runs       TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON usage_events     TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON cache_entries    TO app_user;

-- ============================================================
-- SEED: Four agents
-- ============================================================
INSERT INTO agents (name, capabilities, description) VALUES
  ('AlinaArchitect', ARRAY['READ_SOURCE','READ_EVIDENCE','WRITE_DRAFT'],
   'Reads sources and evidence; writes architecture drafts.'),
  ('AlinaGuard',     ARRAY['READ_EVIDENCE','RUN_VALIDATION'],
   'Reads evidence and runs validation rules.'),
  ('AlinaDocEngine', ARRAY['COMPILE_ARTIFACT'],
   'Compiles approved drafts into output artifacts.'),
  ('AlinaOptimizer', ARRAY['READ_USAGE','WRITE_CACHE_METADATA'],
   'Reads usage data and manages cache metadata.');

-- ============================================================
-- MIGRATION REGISTRY
-- ============================================================
INSERT INTO schema_migrations (name) VALUES ('004_jobs_agents');

COMMIT;
