-- Migration 008: Release Labels
-- AlinaMatrix Enterprise — Enterprise Candidate — Active Development
-- Forward-only. Do not modify after deployment.
--
-- Scope: Phase 9 Unit 1 — release gate and label lifecycle.
-- Table: release_labels — one row per rendered artifact; label lifecycle.
--
-- Immutability:
--   release_labels.published_html is immutable: a trigger rejects UPDATE of
--   the published_html column (published bytes are never mutated). Label
--   transitions and revoked_at are updatable.
--   GRANT excludes DELETE.

BEGIN;

-- ============================================================
-- RELEASE LABELS
-- One row per rendered artifact. Tracks the label lifecycle:
-- DRAFT -> INTERNAL_REVIEW -> APPROVED -> PUBLISHED -> ARCHIVED | REVOKED
-- published_html is the immutable published bytes (set when PUBLISHED).
-- A trigger rejects any UPDATE of published_html (published bytes are immutable).
-- revoked_at is set when the label transitions to REVOKED.
-- ============================================================
CREATE TABLE release_labels (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid        NOT NULL REFERENCES tenants(id)            ON DELETE CASCADE,
  project_id               uuid        NOT NULL REFERENCES projects(id)           ON DELETE CASCADE,
  rendered_artifact_id     uuid        NOT NULL REFERENCES rendered_artifacts(id) ON DELETE CASCADE,
  label                    text        NOT NULL DEFAULT 'DRAFT'
                                       CHECK (label IN ('DRAFT','INTERNAL_REVIEW','APPROVED','PUBLISHED','ARCHIVED','REVOKED')),
  published_html           text,
  published_html_sha256    text,
  published_at             timestamptz,
  revoked_at               timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  label_updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rendered_artifact_id)
);

-- Trigger: prevent UPDATE of published_html (published bytes are immutable).
CREATE OR REPLACE FUNCTION release_labels_published_html_immutable() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.published_html IS DISTINCT FROM OLD.published_html THEN
    RAISE EXCEPTION 'published_html is immutable; published bytes cannot be mutated';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER release_labels_no_published_html_update
  BEFORE UPDATE ON release_labels
  FOR EACH ROW EXECUTE FUNCTION release_labels_published_html_immutable();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON release_labels (tenant_id);
CREATE INDEX ON release_labels (project_id);
CREATE INDEX ON release_labels (rendered_artifact_id);
CREATE INDEX ON release_labels (label);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE release_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_labels FORCE  ROW LEVEL SECURITY;

CREATE POLICY release_labels_tenant ON release_labels FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ============================================================
-- GRANTS
-- ============================================================
-- release_labels: SELECT, INSERT, UPDATE (label + revoked_at are updatable;
-- published_html is protected by trigger).
GRANT SELECT, INSERT, UPDATE ON release_labels TO app_user;

-- ============================================================
-- MIGRATION REGISTRY
-- ============================================================
INSERT INTO schema_migrations (name) VALUES ('008_release_labels');

COMMIT;
