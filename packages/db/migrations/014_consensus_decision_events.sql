-- Migration 014: Consensus Decision Events
-- AlinaMatrix Enterprise — Enterprise Candidate — Active Development
-- Forward-only. Do not modify after deployment.
--
-- Scope: Phase E Unit 2 — multi-party consensus review.
-- Table: consensus_decision_events — append-only (INSERT only).
--
-- Immutability:
--   consensus_decision_events is append-only: triggers reject UPDATE and DELETE.
--   GRANT excludes UPDATE and DELETE.
--   Each row is an approver's decision event. The consensus state is derived
--   by the domain layer (evaluateConsensus) from the events + the config.

BEGIN;

-- ============================================================
-- CONSENSUS DECISION EVENTS (append-only)
-- One row per decision event. INSERT only — no UPDATE, no DELETE.
-- Records an approver's "approved" or "rejected" decision for a review task.
-- ============================================================
CREATE TABLE consensus_decision_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id)            ON DELETE CASCADE,
  review_task_id  uuid        NOT NULL REFERENCES review_tasks(id)       ON DELETE CASCADE,
  approver_id     uuid        NOT NULL,
  decision        text        NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decided_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- An approver can submit at most one decision per review task.
  UNIQUE (review_task_id, approver_id)
);

CREATE OR REPLACE FUNCTION consensus_decision_events_immutable() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'consensus_decision_events is immutable; append a new row instead';
END;
$$;

CREATE TRIGGER consensus_decision_events_no_update
  BEFORE UPDATE ON consensus_decision_events
  FOR EACH ROW EXECUTE FUNCTION consensus_decision_events_immutable();

CREATE TRIGGER consensus_decision_events_no_delete
  BEFORE DELETE ON consensus_decision_events
  FOR EACH ROW EXECUTE FUNCTION consensus_decision_events_immutable();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON consensus_decision_events (tenant_id);
CREATE INDEX ON consensus_decision_events (review_task_id);
CREATE INDEX ON consensus_decision_events (approver_id);
CREATE INDEX ON consensus_decision_events (decision);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE consensus_decision_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE consensus_decision_events FORCE  ROW LEVEL SECURITY;

CREATE POLICY consensus_decision_events_tenant ON consensus_decision_events FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ============================================================
-- GRANTS
-- consensus_decision_events: INSERT only (append-only). No UPDATE, no DELETE.
-- ============================================================
GRANT SELECT, INSERT ON consensus_decision_events TO app_user;

-- ============================================================
-- MIGRATION REGISTRY
-- ============================================================
INSERT INTO schema_migrations (name) VALUES ('014_consensus_decision_events');

COMMIT;
