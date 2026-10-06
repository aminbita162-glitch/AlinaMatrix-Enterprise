-- Migration 011: Revocation Events
-- AlinaMatrix Enterprise — Enterprise Candidate — Active Development
-- Forward-only. Do not modify after deployment.
--
-- Scope: Phase 9 Unit 4 — revocation.
-- Table: revocation_events — append-only (INSERT only).
--
-- Immutability:
--   revocation_events is append-only: triggers reject UPDATE and DELETE.
--   GRANT excludes UPDATE and DELETE.
--   Revocation does not mutate published bytes — the published_html column
--   in release_labels is protected by the migration 008 trigger.

BEGIN;

-- ============================================================
-- REVOCATION EVENTS (append-only)
-- One row per revocation. INSERT only — no UPDATE, no DELETE.
-- Records who revoked, why, when, and the prior label.
-- ============================================================
CREATE TABLE revocation_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id)            ON DELETE CASCADE,
  artifact_id     uuid        NOT NULL REFERENCES rendered_artifacts(id) ON DELETE CASCADE,
  revoked_by      uuid        NOT NULL REFERENCES users(id),
  reason          text        NOT NULL,
  revoked_at      timestamptz NOT NULL DEFAULT now(),
  prior_label     text        NOT NULL
                              CHECK (prior_label IN ('DRAFT','INTERNAL_REVIEW','APPROVED','PUBLISHED','ARCHIVED','REVOKED')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION revocation_events_immutable() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'revocation_events is immutable; append a new row instead';
END;
$$;

CREATE TRIGGER revocation_events_no_update
  BEFORE UPDATE ON revocation_events
  FOR EACH ROW EXECUTE FUNCTION revocation_events_immutable();

CREATE TRIGGER revocation_events_no_delete
  BEFORE DELETE ON revocation_events
  FOR EACH ROW EXECUTE FUNCTION revocation_events_immutable();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON revocation_events (tenant_id);
CREATE INDEX ON revocation_events (artifact_id);
CREATE INDEX ON revocation_events (revoked_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE revocation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE revocation_events FORCE  ROW LEVEL SECURITY;

CREATE POLICY revocation_events_tenant ON revocation_events FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ============================================================
-- GRANTS
-- revocation_events: INSERT only (append-only). No UPDATE, no DELETE.
-- ============================================================
GRANT SELECT, INSERT ON revocation_events TO app_user;

-- ============================================================
-- MIGRATION REGISTRY
-- ============================================================
INSERT INTO schema_migrations (name) VALUES ('011_revocation_events');

COMMIT;
