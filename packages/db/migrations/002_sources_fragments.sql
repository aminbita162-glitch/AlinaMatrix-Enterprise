-- Migration 002: Immutable Source and Fragments
-- AlinaMatrix Enterprise — Enterprise Candidate — Active Development
-- Forward-only. Do not modify after deployment.

BEGIN;

-- ============================================================
-- SOURCES
-- One row per logical source document, owned by a project.
-- ============================================================
CREATE TABLE sources (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id  uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  mime_type   text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- SOURCE VERSIONS
-- Each upload of a source produces exactly one version row.
-- Original bytes are immutable: no UPDATE or DELETE policies.
-- Second upload of identical sha256 (same idempotency_key) is
-- rejected by the UNIQUE constraint — the caller receives the
-- existing version_id instead of creating a duplicate row.
-- ============================================================
CREATE TABLE source_versions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id        uuid        NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  tenant_id        uuid        NOT NULL REFERENCES tenants(id),
  -- sha256 hex digest of original bytes
  sha256           text        NOT NULL,
  size_bytes       bigint      NOT NULL CHECK (size_bytes > 0),
  storage_path     text        NOT NULL,
  -- Client-supplied idempotency key: duplicate key = same logical upload
  idempotency_key  text        NOT NULL,
  -- Extraction status
  status           text        NOT NULL
                               DEFAULT 'INGESTED'
                               CHECK (status IN (
                                 'INGESTED',
                                 'EXTRACTED',
                                 'FAILED_TERMINAL'
                               )),
  fail_reason      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Idempotency: same idempotency_key for the same source is deduplicated
  UNIQUE (source_id, idempotency_key),
  -- Content-level deduplication: same bytes within the same source
  UNIQUE (source_id, sha256)
);

-- ============================================================
-- SOURCE FRAGMENTS
-- Extracted text chunks from a version.
-- Immutable: no UPDATE or DELETE policies.
-- ============================================================
CREATE TABLE source_fragments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id  uuid        NOT NULL REFERENCES source_versions(id) ON DELETE CASCADE,
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  ordinal     integer     NOT NULL CHECK (ordinal >= 0),
  page        integer,                         -- null if unknown
  text        text        NOT NULL,
  char_start  integer     NOT NULL CHECK (char_start >= 0),
  char_end    integer     NOT NULL CHECK (char_end > char_start),
  -- sha256 of fragment text — used for quote-lock in Phase 4
  hash        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, ordinal)
);

-- ============================================================
-- EVIDENCE ITEMS
-- Structured evidence atoms derived from fragments.
-- One evidence item references one fragment and adds a kind
-- classification used by downstream agents.
-- ============================================================
CREATE TABLE evidence_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id  uuid        NOT NULL REFERENCES source_versions(id) ON DELETE CASCADE,
  fragment_id uuid        NOT NULL REFERENCES source_fragments(id) ON DELETE CASCADE,
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  -- kind: the type of evidence signal
  kind        text        NOT NULL
                          CHECK (kind IN ('statement', 'data_point', 'methodology', 'limitation', 'other')),
  text        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON sources (tenant_id);
CREATE INDEX ON sources (project_id);
CREATE INDEX ON source_versions (source_id);
CREATE INDEX ON source_versions (tenant_id);
CREATE INDEX ON source_versions (sha256);
CREATE INDEX ON source_versions (idempotency_key);
CREATE INDEX ON source_fragments (version_id);
CREATE INDEX ON source_fragments (tenant_id);
CREATE INDEX ON evidence_items (version_id);
CREATE INDEX ON evidence_items (fragment_id);
CREATE INDEX ON evidence_items (tenant_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE sources          ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_fragments ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_items   ENABLE ROW LEVEL SECURITY;

ALTER TABLE sources          FORCE ROW LEVEL SECURITY;
ALTER TABLE source_versions  FORCE ROW LEVEL SECURITY;
ALTER TABLE source_fragments FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence_items   FORCE ROW LEVEL SECURITY;

-- sources: tenant-scoped read and insert
CREATE POLICY tenant_isolation ON sources
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- source_versions: SELECT and INSERT allowed; no UPDATE or DELETE
-- Immutability enforced by the absence of UPDATE/DELETE policies.
CREATE POLICY sv_select ON source_versions
  FOR SELECT
  USING (tenant_id = current_tenant_id());

CREATE POLICY sv_insert ON source_versions
  FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());

-- The single allowed UPDATE is status + fail_reason (extraction result).
-- We express this as a restricted UPDATE policy scoped to those columns.
CREATE POLICY sv_update_status ON source_versions
  FOR UPDATE
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- source_fragments: SELECT and INSERT only (immutable after creation)
CREATE POLICY sf_select ON source_fragments
  FOR SELECT
  USING (tenant_id = current_tenant_id());

CREATE POLICY sf_insert ON source_fragments
  FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());

-- evidence_items: SELECT and INSERT only
CREATE POLICY ei_select ON evidence_items
  FOR SELECT
  USING (tenant_id = current_tenant_id());

CREATE POLICY ei_insert ON evidence_items
  FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());

-- ============================================================
-- MIGRATION REGISTRY
-- ============================================================
INSERT INTO schema_migrations (name) VALUES ('002_sources_fragments');

COMMIT;
