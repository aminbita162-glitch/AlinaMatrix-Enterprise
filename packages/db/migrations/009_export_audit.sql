-- Migration 009: Export Audit
-- AlinaMatrix Enterprise — Enterprise Candidate — Active Development
-- Forward-only. Do not modify after deployment.
--
-- Scope: Phase 9 Unit 2 — export audit (append-only).
-- Table: export_audit — one row per export attempt. INSERT only.
--
-- Immutability:
--   export_audit is append-only: triggers reject UPDATE and DELETE.
--   GRANT excludes UPDATE and DELETE.

BEGIN;

-- ============================================================
-- EXPORT AUDIT (append-only)
-- One row per export attempt. INSERT only — no UPDATE, no DELETE.
-- Records whether the export was permitted, the watermark status, and the
-- sha256 of the exported HTML.
-- ============================================================
CREATE TABLE export_audit (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id)            ON DELETE CASCADE,
  artifact_id       uuid        NOT NULL REFERENCES rendered_artifacts(id) ON DELETE CASCADE,
  exported_by       uuid        NOT NULL REFERENCES users(id),
  permitted         boolean     NOT NULL,
  denied_reason     text,
  watermarked        boolean     NOT NULL DEFAULT false,
  html_sha256        text,
  exported_at        timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION export_audit_immutable() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'export_audit is immutable; append a new row instead';
END;
$$;

CREATE TRIGGER export_audit_no_update
  BEFORE UPDATE ON export_audit
  FOR EACH ROW EXECUTE FUNCTION export_audit_immutable();

CREATE TRIGGER export_audit_no_delete
  BEFORE DELETE ON export_audit
  FOR EACH ROW EXECUTE FUNCTION export_audit_immutable();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON export_audit (tenant_id);
CREATE INDEX ON export_audit (artifact_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE export_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_audit FORCE  ROW LEVEL SECURITY;

CREATE POLICY export_audit_tenant ON export_audit FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ============================================================
-- GRANTS
-- ============================================================
-- export_audit: INSERT only (append-only). No UPDATE, no DELETE.
GRANT SELECT, INSERT ON export_audit TO app_user;

-- ============================================================
-- MIGRATION REGISTRY
-- ============================================================
INSERT INTO schema_migrations (name) VALUES ('009_export_audit');

COMMIT;
