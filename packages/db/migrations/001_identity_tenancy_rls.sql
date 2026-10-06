-- Migration 001: Identity, Tenancy, RLS, Audit
-- AlinaMatrix Enterprise — Enterprise Candidate — Active Development
-- Forward-only. Do not modify after deployment.

BEGIN;

-- ============================================================
-- UTILITY: safe tenant id extraction
-- Returns NULL (not an error) when app.current_tenant_id is not set.
-- RLS USING clauses that compare against NULL will yield no rows.
-- ============================================================
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
$$;

-- ============================================================
-- TENANTS
-- ============================================================
CREATE TABLE tenants (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  slug        text        NOT NULL UNIQUE,
  is_fixture  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ROLES
-- ============================================================
CREATE TABLE roles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text        NOT NULL UNIQUE,
  -- argon2id hash; never logged or returned via API
  password_hash   text        NOT NULL,
  is_fixture      boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- MEMBERSHIPS
-- ============================================================
CREATE TABLE memberships (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  role_id     uuid        REFERENCES roles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE projects (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- AUDIT EVENTS
-- Append-only. Update and delete are denied by RLS policy.
-- ============================================================
CREATE TABLE audit_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  user_id     uuid        REFERENCES users(id),
  action      text        NOT NULL,
  resource    text        NOT NULL,
  resource_id text,
  detail      jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- SESSIONS
-- Server-side session store. Client holds an opaque session_id cookie.
-- ============================================================
CREATE TABLE sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON memberships (user_id);
CREATE INDEX ON memberships (tenant_id);
CREATE INDEX ON sessions (user_id);
CREATE INDEX ON sessions (expires_at);
CREATE INDEX ON projects (tenant_id);
CREATE INDEX ON audit_events (tenant_id, created_at DESC);
CREATE INDEX ON roles (tenant_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- All tenant-scoped tables: USING checks current_tenant_id().
-- When app.current_tenant_id is not set, current_tenant_id() returns NULL.
-- NULL = any_uuid is NULL (unknown), so the USING clause yields no rows.
-- This is the "fail closed" behaviour required by the directive.
-- ============================================================

ALTER TABLE tenants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships    ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions       ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner (i.e. the application role)
ALTER TABLE tenants        FORCE ROW LEVEL SECURITY;
ALTER TABLE roles          FORCE ROW LEVEL SECURITY;
ALTER TABLE users          FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships    FORCE ROW LEVEL SECURITY;
ALTER TABLE projects       FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events   FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions       FORCE ROW LEVEL SECURITY;

-- tenants: only the current tenant is visible
CREATE POLICY tenant_isolation ON tenants
  USING (id = current_tenant_id());

-- roles: scoped to current tenant
CREATE POLICY tenant_isolation ON roles
  USING (tenant_id = current_tenant_id());

-- users: visible only if the user is a member of the current tenant
CREATE POLICY tenant_isolation ON users
  USING (
    id IN (
      SELECT user_id FROM memberships WHERE tenant_id = current_tenant_id()
    )
  );

-- memberships: scoped to current tenant
CREATE POLICY tenant_isolation ON memberships
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- projects: scoped to current tenant
CREATE POLICY tenant_isolation ON projects
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- audit_events: read scoped to current tenant; insert allowed; update/delete denied
CREATE POLICY tenant_isolation_select ON audit_events
  FOR SELECT
  USING (tenant_id = current_tenant_id());

CREATE POLICY audit_insert ON audit_events
  FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());

-- No UPDATE or DELETE policy — any attempt returns permission denied (fail closed)

-- sessions: scoped to current tenant
CREATE POLICY tenant_isolation ON sessions
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ============================================================
-- MIGRATION REGISTRY
-- ============================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  id         serial      PRIMARY KEY,
  name       text        NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (name) VALUES ('001_identity_tenancy_rls');

COMMIT;
