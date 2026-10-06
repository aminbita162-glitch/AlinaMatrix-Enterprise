-- Migration 013: Code-to-Document Traces
-- AlinaMatrix Enterprise — Enterprise Candidate — Active Development
-- Forward-only. Do not modify after deployment.
--
-- Scope: Phase D Unit 3 — code-to-document trace.
-- Table: code_to_document_traces — append-only (INSERT only).
--
-- Immutability:
--   code_to_document_traces is append-only: triggers reject UPDATE and DELETE.
--   GRANT excludes UPDATE and DELETE.
--   Links a cited source path to a claim and the rendered section.

BEGIN;

-- ============================================================
-- CODE-TO-DOCUMENT TRACES (append-only)
-- One row per trace. INSERT only — no UPDATE, no DELETE.
-- Links a cited path to a claim and a rendered section.
-- ============================================================
CREATE TABLE code_to_document_traces (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id)            ON DELETE CASCADE,
  cited_path      text        NOT NULL,
  claim_id        uuid        NOT NULL,
  artifact_id     uuid        NOT NULL REFERENCES rendered_artifacts(id) ON DELETE CASCADE,
  section         text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION code_to_document_traces_immutable() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'code_to_document_traces is immutable; append a new row instead';
END;
$$;

CREATE TRIGGER code_to_document_traces_no_update
  BEFORE UPDATE ON code_to_document_traces
  FOR EACH ROW EXECUTE FUNCTION code_to_document_traces_immutable();

CREATE TRIGGER code_to_document_traces_no_delete
  BEFORE DELETE ON code_to_document_traces
  FOR EACH ROW EXECUTE FUNCTION code_to_document_traces_immutable();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON code_to_document_traces (tenant_id);
CREATE INDEX ON code_to_document_traces (claim_id);
CREATE INDEX ON code_to_document_traces (artifact_id);
CREATE INDEX ON code_to_document_traces (cited_path);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE code_to_document_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_to_document_traces FORCE  ROW LEVEL SECURITY;

CREATE POLICY code_to_document_traces_tenant ON code_to_document_traces FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ============================================================
-- GRANTS
-- code_to_document_traces: INSERT only (append-only). No UPDATE, no DELETE.
-- ============================================================
GRANT SELECT, INSERT ON code_to_document_traces TO app_user;

-- ============================================================
-- MIGRATION REGISTRY
-- ============================================================
INSERT INTO schema_migrations (name) VALUES ('013_code_to_document_traces');

COMMIT;
