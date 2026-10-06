-- Migration 007: Rendered Artifacts and Build Manifests
-- AlinaMatrix Enterprise — Enterprise Candidate — Active Development
-- Forward-only. Do not modify after deployment.
--
-- Scope: Phase 8 — renderer and build manifest.
-- Tables:
--   rendered_artifacts — one per build; stores HTML, sha256, manifest JSON.
--   build_manifests    — one row per rendered_artifact; the pinned manifest.
--
-- Immutability:
--   rendered_artifacts and build_manifests are INSERT-only.
--   A trigger rejects UPDATE and DELETE (published content is immutable).
--   GRANT excludes UPDATE and DELETE.

BEGIN;

-- ============================================================
-- RENDERED ARTIFACTS
-- One row per build.  html_sha256 is the SHA-256 of the HTML string.
-- manifest_json stores the full RenderManifest value.
-- content_hash is the SHA-256 of the approved content JSON.
-- ============================================================
CREATE TABLE rendered_artifacts (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  project_id       uuid        NOT NULL REFERENCES projects(id)      ON DELETE CASCADE,
  workflow_run_id  uuid        NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  -- The rendered HTML.
  html             text        NOT NULL,
  html_sha256      text        NOT NULL,
  -- The manifest JSON (pinned version inputs + checksums).
  manifest_json    jsonb       NOT NULL,
  -- SHA-256 of the approved content JSON (content hash).
  content_hash     text        NOT NULL,
  -- Version pins.
  prompt_version_id  uuid      NOT NULL REFERENCES prompt_versions(id),
  model_version_id   uuid      NOT NULL REFERENCES model_versions(id),
  schema_version_id  uuid      NOT NULL REFERENCES schema_versions(id),
  policy_version_id  uuid      NOT NULL REFERENCES policy_versions(id),
  -- Renderer + template.
  renderer         text        NOT NULL,
  template         text        NOT NULL,
  -- Build identification.
  build_id         uuid        NOT NULL,
  build_time       timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- One rendered artifact per (workflow_run_id, build_id).
  UNIQUE (workflow_run_id, build_id)
);

-- ============================================================
-- BUILD MANIFESTS
-- One row per rendered_artifact.  Mirrors the manifest_json fields
-- as columns for SQL-queryable access.
-- ============================================================
CREATE TABLE build_manifests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  rendered_artifact_id uuid     NOT NULL REFERENCES rendered_artifacts(id) ON DELETE CASCADE,
  -- Manifest fields (pinned).
  content_hash        text      NOT NULL,
  source_version_ids  uuid[]    NOT NULL DEFAULT '{}',
  prompt_version_id   uuid      NOT NULL,
  model_version_id    uuid      NOT NULL,
  schema_version_id   uuid      NOT NULL,
  policy_version_id   uuid      NOT NULL,
  renderer            text      NOT NULL,
  template            text      NOT NULL,
  build_id            uuid      NOT NULL,
  build_time          timestamptz NOT NULL,
  html_sha256         text      NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- One manifest per rendered artifact.
  UNIQUE (rendered_artifact_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON rendered_artifacts (tenant_id);
CREATE INDEX ON rendered_artifacts (project_id);
CREATE INDEX ON rendered_artifacts (workflow_run_id);
CREATE INDEX ON rendered_artifacts (build_id);
CREATE INDEX ON build_manifests   (tenant_id);
CREATE INDEX ON build_manifests   (rendered_artifact_id);

-- ============================================================
-- IMMUTABILITY TRIGGERS
-- Published row content update rejected by trigger.
-- ============================================================
CREATE OR REPLACE FUNCTION rendered_artifacts_immutable() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'rendered_artifacts are immutable; published content cannot be updated';
END;
$$;

CREATE TRIGGER rendered_artifacts_no_update
  BEFORE UPDATE ON rendered_artifacts
  FOR EACH ROW EXECUTE FUNCTION rendered_artifacts_immutable();

CREATE TRIGGER rendered_artifacts_no_delete
  BEFORE DELETE ON rendered_artifacts
  FOR EACH ROW EXECUTE FUNCTION rendered_artifacts_immutable();

CREATE OR REPLACE FUNCTION build_manifests_immutable() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'build_manifests are immutable; published manifest cannot be updated';
END;
$$;

CREATE TRIGGER build_manifests_no_update
  BEFORE UPDATE ON build_manifests
  FOR EACH ROW EXECUTE FUNCTION build_manifests_immutable();

CREATE TRIGGER build_manifests_no_delete
  BEFORE DELETE ON build_manifests
  FOR EACH ROW EXECUTE FUNCTION build_manifests_immutable();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE rendered_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendered_artifacts FORCE  ROW LEVEL SECURITY;
ALTER TABLE build_manifests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE build_manifests   FORCE  ROW LEVEL SECURITY;

CREATE POLICY rendered_artifacts_tenant ON rendered_artifacts FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY build_manifests_tenant ON build_manifests FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ============================================================
-- GRANTS
-- ============================================================
-- INSERT and SELECT only: no UPDATE, no DELETE.
-- Immutability enforced by both GRANT and trigger.
GRANT SELECT, INSERT ON rendered_artifacts TO app_user;
GRANT SELECT, INSERT ON build_manifests   TO app_user;

-- ============================================================
-- MIGRATION REGISTRY
-- ============================================================
INSERT INTO schema_migrations (name) VALUES ('007_rendered_artifacts');

COMMIT;
