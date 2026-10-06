-- Migration 006: Human Review Tables
-- AlinaMatrix Enterprise — Enterprise Candidate — Active Development
-- Forward-only. Do not modify after deployment.
--
-- Scope: Phase 7 — review_tasks, approvals, comments.
-- Comments are immutable: INSERT only (no UPDATE, no DELETE via GRANT).

BEGIN;

-- ============================================================
-- REVIEW TASKS
-- One review task per workflow_run that reaches NEEDS_REVIEW.
-- author_id: the user who produced the draft (cannot be sole release approver).
-- state: open | approved | rejected
-- ============================================================
CREATE TABLE review_tasks (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES tenants(id)        ON DELETE CASCADE,
  project_id       uuid        NOT NULL REFERENCES projects(id)       ON DELETE CASCADE,
  workflow_run_id  uuid        NOT NULL REFERENCES workflow_runs(id)  ON DELETE CASCADE,
  draft_id         uuid        REFERENCES m03_drafts(id),
  author_id        uuid        NOT NULL REFERENCES users(id),
  state            text        NOT NULL DEFAULT 'open'
                               CHECK (state IN ('open', 'approved', 'rejected')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- One active review task per workflow run.
  UNIQUE (workflow_run_id)
);

-- ============================================================
-- APPROVALS
-- One approval row per (task, approver).
-- decision: approved | rejected
-- Unique: an approver can record only one decision per task.
-- ============================================================
CREATE TABLE approvals (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  task_id        uuid        NOT NULL REFERENCES review_tasks(id)  ON DELETE CASCADE,
  approver_id    uuid        NOT NULL REFERENCES users(id),
  decision       text        NOT NULL CHECK (decision IN ('approved', 'rejected')),
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- One decision per approver per task.
  UNIQUE (task_id, approver_id)
);

-- ============================================================
-- COMMENTS
-- Append-only: corrections must be new rows.
-- The DB GRANT excludes UPDATE and DELETE to enforce immutability.
-- A trigger additionally prevents UPDATE and DELETE at the SQL level.
-- ============================================================
CREATE TABLE comments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  task_id     uuid        NOT NULL REFERENCES review_tasks(id)  ON DELETE CASCADE,
  author_id   uuid        NOT NULL REFERENCES users(id),
  body        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Immutability trigger: prevent any UPDATE or DELETE on comments.
CREATE OR REPLACE FUNCTION comments_immutable() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'comments are immutable; add a new comment instead';
END;
$$;

CREATE TRIGGER comments_no_update
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION comments_immutable();

CREATE TRIGGER comments_no_delete
  BEFORE DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION comments_immutable();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON review_tasks (tenant_id);
CREATE INDEX ON review_tasks (project_id);
CREATE INDEX ON review_tasks (workflow_run_id);
CREATE INDEX ON review_tasks (state);
CREATE INDEX ON approvals    (tenant_id);
CREATE INDEX ON approvals    (task_id);
CREATE INDEX ON comments     (tenant_id);
CREATE INDEX ON comments     (task_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE review_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_tasks FORCE  ROW LEVEL SECURITY;
ALTER TABLE approvals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals    FORCE  ROW LEVEL SECURITY;
ALTER TABLE comments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments     FORCE  ROW LEVEL SECURITY;

CREATE POLICY review_tasks_tenant ON review_tasks FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY approvals_tenant ON approvals FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY comments_tenant ON comments FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ============================================================
-- GRANTS
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON review_tasks TO app_user;
GRANT SELECT, INSERT ON approvals TO app_user;
-- Comments: INSERT only. No UPDATE, no DELETE — enforced by both GRANT and trigger.
GRANT SELECT, INSERT ON comments TO app_user;

-- ============================================================
-- MIGRATION REGISTRY
-- ============================================================
INSERT INTO schema_migrations (name) VALUES ('006_human_review');

COMMIT;
