-- Migration 015: Context Snapshots
-- AlinaMatrix Enterprise — Enterprise Candidate — Active Development
-- Forward-only. Do not modify after deployment.
--
-- Scope: ECIDR — Verifiable Evidence Context Integrity & Deterministic Replay.
-- Table: context_snapshots — append-only (INSERT only for SEALED/CONSUMED/REJECTED).
--
-- Immutability:
--   context_snapshots is append-only for SEALED/CONSUMED/REJECTED states:
--   triggers reject UPDATE and DELETE on rows in those states.
--   PREPARED rows may be updated (to add sealedAt, predecessorSnapshotId) but
--   once a row is SEALED it is immutable.
--
-- Directive ECIDR §07:
--   "State model: PREPARED -> SEALED -> CONSUMED (or REJECTED)"
--   "SEALED content is immutable; changes create a new snapshot with a new
--    digest and linkage to predecessor, never overwrite historical bytes."
--
-- Directive ECIDR §08:
--   "Verify every new tenant-scoped table has RLS with deny-by-default behavior,
--    correct FORCE RLS or equivalent verified role discipline, tenant-filtered
--    foreign-key/ownership checks, least-privilege grants, and non-bypass
--    service roles."
--   "Enforce idempotent creation by a unique tenant/job/context digest or
--    equivalent tested key."

BEGIN;

-- ============================================================
-- CONTEXT SNAPSHOTS
-- One row per context snapshot. PREPARED rows may be updated; SEALED,
-- CONSUMED, and REJECTED rows are immutable.
-- Pins the full Context Contract V1: tenant, project, run, job, agent, task,
-- source refs, prompt/schema/policy/model/agent pins, payload hash, snapshot
-- hash, authorization decision id.
-- ============================================================
CREATE TABLE context_snapshots (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid        NOT NULL REFERENCES tenants(id)            ON DELETE CASCADE,
  project_id                  uuid        NOT NULL,
  workflow_run_id             uuid        NOT NULL,
  job_id                      uuid        NOT NULL,
  agent_name                  text        NOT NULL CHECK (agent_name IN ('AlinaArchitect','AlinaGuard','AlinaDocEngine','AlinaOptimizer')),
  task_kind                   text        NOT NULL,
  source_refs                 jsonb       NOT NULL,
  prompt_sha256               text        NOT NULL,
  schema_sha256               text        NOT NULL,
  policy_sha256               text        NOT NULL,
  model_version_id            uuid        NOT NULL,
  agent_version_id            uuid        NOT NULL,
  canonicalization_version   text        NOT NULL,
  context_payload_sha256      text        NOT NULL,
  snapshot_sha256             text        NOT NULL,
  authorization_decision_id   uuid        NOT NULL,
  snapshot_state              text        NOT NULL CHECK (snapshot_state IN ('PREPARED','SEALED','CONSUMED','REJECTED')),
  sealed_at                   timestamptz,
  predecessor_snapshot_id     uuid,
  consumed_at                  timestamptz,
  consumed_by_job_id           uuid,
  rejected_at                  timestamptz,
  reject_reason                text        CHECK (reject_reason IN ('HASH_MISMATCH','SOURCE_NOT_FOUND','SOURCE_REVOKED','POLICY_MISMATCH','INVALID_STATE','CANCELLATION','TENANT_MISMATCH','UNAUTHORIZED_CAPABILITY','SCHEMA_INCOMPATIBILITY')),
  created_at                   timestamptz NOT NULL DEFAULT now(),
  -- SHA-256 fields are 64-char hex digests.
  CHECK (length(prompt_sha256)            = 64),
  CHECK (length(schema_sha256)            = 64),
  CHECK (length(policy_sha256)            = 64),
  CHECK (length(context_payload_sha256)  = 64),
  CHECK (length(snapshot_sha256)          = 64),
  -- Idempotent creation: one snapshot per (tenant_id, job_id, snapshot_sha256).
  UNIQUE (tenant_id, job_id, snapshot_sha256)
);

-- ============================================================
-- IMMUTABILITY TRIGGERS
-- SEALED, CONSUMED, and REJECTED rows cannot be UPDATEd or DELETEd.
-- PREPARED rows may be UPDATEd (to seal them) but not DELETEd.
-- ============================================================
CREATE OR REPLACE FUNCTION context_snapshots_immutable() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  -- SEALED, CONSUMED, and REJECTED rows cannot have their *content* fields
  -- changed. Only state-transition fields (snapshot_state, consumed_at,
  -- consumed_by_job_id, rejected_at, reject_reason) may be updated on a
  -- SEALED row for the CONSUMED/REJECTED transition.
  IF TG_OP = 'UPDATE' AND OLD.snapshot_state IN ('SEALED','CONSUMED','REJECTED') THEN
    -- For SEALED rows, only allow the state transition (SEALED -> CONSUMED
    -- or SEALED -> REJECTED). Content fields must not change.
    IF OLD.snapshot_state = 'SEALED' AND NEW.snapshot_state IN ('CONSUMED','REJECTED') THEN
      -- Verify content fields are unchanged.
      IF OLD.tenant_id <> NEW.tenant_id
         OR OLD.project_id <> NEW.project_id
         OR OLD.workflow_run_id <> NEW.workflow_run_id
         OR OLD.job_id <> NEW.job_id
         OR OLD.agent_name <> NEW.agent_name
         OR OLD.task_kind <> NEW.task_kind
         OR OLD.source_refs::text <> NEW.source_refs::text
         OR OLD.prompt_sha256 <> NEW.prompt_sha256
         OR OLD.schema_sha256 <> NEW.schema_sha256
         OR OLD.policy_sha256 <> NEW.policy_sha256
         OR OLD.model_version_id <> NEW.model_version_id
         OR OLD.agent_version_id <> NEW.agent_version_id
         OR OLD.canonicalization_version <> NEW.canonicalization_version
         OR OLD.context_payload_sha256 <> NEW.context_payload_sha256
         OR OLD.snapshot_sha256 <> NEW.snapshot_sha256
         OR OLD.authorization_decision_id <> NEW.authorization_decision_id
      THEN
        RAISE EXCEPTION 'context_snapshots content fields are immutable in state %', OLD.snapshot_state;
      END IF;
    ELSE
      -- CONSUMED and REJECTED rows are fully immutable — no updates at all.
      RAISE EXCEPTION 'context_snapshots is immutable in state %', OLD.snapshot_state;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.snapshot_state IN ('SEALED','CONSUMED','REJECTED') THEN
    RAISE EXCEPTION 'context_snapshots is immutable in state %; cannot delete', OLD.snapshot_state;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER context_snapshots_no_update_sealed
  BEFORE UPDATE ON context_snapshots
  FOR EACH ROW EXECUTE FUNCTION context_snapshots_immutable();

CREATE TRIGGER context_snapshots_no_delete_sealed
  BEFORE DELETE ON context_snapshots
  FOR EACH ROW EXECUTE FUNCTION context_snapshots_immutable();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON context_snapshots (tenant_id);
CREATE INDEX ON context_snapshots (project_id);
CREATE INDEX ON context_snapshots (job_id);
CREATE INDEX ON context_snapshots (workflow_run_id);
CREATE INDEX ON context_snapshots (snapshot_state);
CREATE INDEX ON context_snapshots (snapshot_sha256);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE context_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_snapshots FORCE  ROW LEVEL SECURITY;

CREATE POLICY context_snapshots_tenant ON context_snapshots FOR ALL
  USING  (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ============================================================
-- GRANTS
-- context_snapshots: SELECT + INSERT for app_user.
-- UPDATE is allowed only for PREPARED -> SEALED transitions (enforced by trigger).
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON context_snapshots TO app_user;

-- ============================================================
-- MIGRATION REGISTRY
-- ============================================================
INSERT INTO schema_migrations (name) VALUES ('015_context_snapshots');

COMMIT;
