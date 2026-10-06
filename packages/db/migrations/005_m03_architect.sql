-- Migration 005: M03 Content Model Tables (Architect, Generate, Guard)
-- AlinaMatrix Enterprise — Enterprise Candidate — Active Development
-- Forward-only. Do not modify after deployment.
--
-- Scope: beachhead M03 only (ADR-0001).
-- Tables: m03_plans (architect output), m03_drafts (generate output).

BEGIN;

-- ============================================================
-- M03 PLANS
-- Produced by AlinaArchitect.  One plan per workflow_run.
-- content_json contains the full ArchitectPlan value.
-- plan_hash is SHA-256 of canonical(content_json) — used to
-- assert determinism (same versioned inputs → same plan_hash).
-- ============================================================
CREATE TABLE m03_plans (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  project_id          uuid        NOT NULL REFERENCES projects(id)      ON DELETE CASCADE,
  workflow_run_id     uuid        NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  -- Version pins — all four must be present.
  agent_version_id    uuid        NOT NULL REFERENCES agent_versions(id),
  prompt_version_id   uuid        NOT NULL REFERENCES prompt_versions(id),
  schema_version_id   uuid        NOT NULL REFERENCES schema_versions(id),
  policy_version_id   uuid        NOT NULL REFERENCES policy_versions(id),
  -- Inputs
  source_version_ids  uuid[]      NOT NULL DEFAULT '{}',
  input_hash          text        NOT NULL,
  -- Output
  content_json        jsonb       NOT NULL,
  plan_hash           text        NOT NULL,
  -- Housekeeping
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- One plan per workflow run (determinism: re-run returns the same row).
  UNIQUE (workflow_run_id)
);

-- ============================================================
-- M03 DRAFTS
-- Produced by AlinaDocEngine (WRITE_DRAFT via AlinaArchitect).
-- One draft per plan.  Contains the full M03 content model.
-- claim_ids lists every claim ID referenced — only existing IDs
-- may appear (enforced at the domain layer).
-- ============================================================
CREATE TABLE m03_drafts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  project_id          uuid        NOT NULL REFERENCES projects(id)      ON DELETE CASCADE,
  workflow_run_id     uuid        NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  plan_id             uuid        NOT NULL REFERENCES m03_plans(id)     ON DELETE CASCADE,
  -- Version pins
  agent_version_id    uuid        NOT NULL REFERENCES agent_versions(id),
  prompt_version_id   uuid        NOT NULL REFERENCES prompt_versions(id),
  schema_version_id   uuid        NOT NULL REFERENCES schema_versions(id),
  policy_version_id   uuid        NOT NULL REFERENCES policy_versions(id),
  -- Referenced existing claim IDs only (no new claim invention).
  claim_ids           uuid[]      NOT NULL DEFAULT '{}',
  -- Full M03 content model stored as JSON.
  content_json        jsonb       NOT NULL,
  draft_hash          text        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- One draft per workflow run.
  UNIQUE (workflow_run_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON m03_plans  (tenant_id);
CREATE INDEX ON m03_plans  (project_id);
CREATE INDEX ON m03_plans  (workflow_run_id);
CREATE INDEX ON m03_drafts (tenant_id);
CREATE INDEX ON m03_drafts (project_id);
CREATE INDEX ON m03_drafts (workflow_run_id);
CREATE INDEX ON m03_drafts (plan_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE m03_plans  ENABLE ROW LEVEL SECURITY;
ALTER TABLE m03_plans  FORCE  ROW LEVEL SECURITY;
ALTER TABLE m03_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE m03_drafts FORCE  ROW LEVEL SECURITY;

CREATE POLICY m03_plans_tenant ON m03_plans FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY m03_drafts_tenant ON m03_drafts FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ============================================================
-- GRANTS
-- ============================================================
GRANT SELECT, INSERT ON m03_plans  TO app_user;
GRANT SELECT, INSERT ON m03_drafts TO app_user;
-- No UPDATE or DELETE: plans and drafts are immutable after creation.

-- ============================================================
-- MIGRATION REGISTRY
-- ============================================================
INSERT INTO schema_migrations (name) VALUES ('005_m03_architect');

COMMIT;
