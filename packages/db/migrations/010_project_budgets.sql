-- Migration 010: Project Budgets
-- AlinaMatrix Enterprise — Enterprise Candidate — Active Development
-- Forward-only. Do not modify after deployment.
--
-- Scope: Phase 9 Unit 3 — budget breaker.
-- Table: project_budgets — one row per (tenant_id, project_id).
-- Stores the budget cap and the amount spent in minor units (bigint).
-- Updated as usage accrues.
--
-- Immutability:
--   project_budgets is updatable (spent_minor_units accrues), so no
--   immutability trigger is needed. RLS enforces tenant isolation.
--   GRANT SELECT, INSERT, UPDATE (no DELETE — budgets are not deleted).

BEGIN;

-- ============================================================
-- PROJECT BUDGETS
-- One row per (tenant_id, project_id). bigint columns for exact
-- monetary amounts in minor units.
-- ============================================================
CREATE TABLE project_budgets (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  project_id           uuid        NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  budget_minor_units   bigint      NOT NULL,
  spent_minor_units    bigint      NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, project_id),
  CONSTRAINT budget_non_negative  CHECK (budget_minor_units >= 0),
  CONSTRAINT spent_non_negative   CHECK (spent_minor_units >= 0)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON project_budgets (tenant_id);
CREATE INDEX ON project_budgets (project_id);
CREATE UNIQUE INDEX ON project_budgets (tenant_id, project_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE project_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_budgets FORCE  ROW LEVEL SECURITY;

CREATE POLICY project_budgets_tenant ON project_budgets FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ============================================================
-- GRANTS
-- project_budgets: SELECT, INSERT, UPDATE (no DELETE).
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON project_budgets TO app_user;

-- ============================================================
-- MIGRATION REGISTRY
-- ============================================================
INSERT INTO schema_migrations (name) VALUES ('010_project_budgets');

COMMIT;
