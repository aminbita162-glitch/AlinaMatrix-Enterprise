-- Migration 012: Provenance Ledger
-- AlinaMatrix Enterprise — Enterprise Candidate — Active Development
-- Forward-only. Do not modify after deployment.
--
-- Scope: Phase D Unit 1 — Merkle provenance ledger.
-- Table: provenance_ledger — append-only (INSERT only).
--
-- Immutability:
--   provenance_ledger is append-only: triggers reject UPDATE and DELETE.
--   GRANT excludes UPDATE and DELETE.
--   The ledger root is computed by the domain layer (computeMerkleRoot) and
--   stored as a column; the DB does not recompute it.

BEGIN;

-- ============================================================
-- PROVENANCE LEDGER (append-only)
-- One row per ledger entry. INSERT only — no UPDATE, no DELETE.
-- Pins the four leaf fields (source version, content hash, manifest
-- sha256, html sha256) plus the leaf hash and the Merkle ledger root.
-- ============================================================
CREATE TABLE provenance_ledger (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id)            ON DELETE CASCADE,
  artifact_id         uuid        NOT NULL REFERENCES rendered_artifacts(id) ON DELETE CASCADE,
  source_version_id   uuid        NOT NULL,
  content_hash        text        NOT NULL,
  manifest_sha256     text        NOT NULL,
  html_sha256         text        NOT NULL,
  leaf_hash           text        NOT NULL,
  ledger_root         text        NOT NULL,
  sequence            integer     NOT NULL CHECK (sequence > 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- One entry per (artifact_id, sequence).
  UNIQUE (artifact_id, sequence),
  -- Content + manifest + html sha256 are 64-char hex digests.
  CHECK (length(content_hash)    = 64),
  CHECK (length(manifest_sha256) = 64),
  CHECK (length(html_sha256)     = 64),
  CHECK (length(leaf_hash)       = 64),
  CHECK (length(ledger_root)     = 64)
);

CREATE OR REPLACE FUNCTION provenance_ledger_immutable() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'provenance_ledger is immutable; append a new row instead';
END;
$$;

CREATE TRIGGER provenance_ledger_no_update
  BEFORE UPDATE ON provenance_ledger
  FOR EACH ROW EXECUTE FUNCTION provenance_ledger_immutable();

CREATE TRIGGER provenance_ledger_no_delete
  BEFORE DELETE ON provenance_ledger
  FOR EACH ROW EXECUTE FUNCTION provenance_ledger_immutable();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON provenance_ledger (tenant_id);
CREATE INDEX ON provenance_ledger (artifact_id);
CREATE INDEX ON provenance_ledger (source_version_id);
CREATE INDEX ON provenance_ledger (ledger_root);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE provenance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE provenance_ledger FORCE  ROW LEVEL SECURITY;

CREATE POLICY provenance_ledger_tenant ON provenance_ledger FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ============================================================
-- GRANTS
-- provenance_ledger: INSERT only (append-only). No UPDATE, no DELETE.
-- ============================================================
GRANT SELECT, INSERT ON provenance_ledger TO app_user;

-- ============================================================
-- MIGRATION REGISTRY
-- ============================================================
INSERT INTO schema_migrations (name) VALUES ('012_provenance_ledger');

COMMIT;
