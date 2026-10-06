-- Fixture seed: two tenants, two users.
-- Marked is_fixture = true so they are identifiable in tests and can be cleaned up.
-- DO NOT use these in production. Passwords are fixed test values.
--
-- argon2id hashes below correspond to:
--   user_alpha@fixture.test  -> password: "fixture-password-alpha"
--   user_beta@fixture.test   -> password: "fixture-password-beta"
--
-- Hashes were generated with argon2id m=65536, t=3, p=4.
-- AlinaMatrix Enterprise — Enterprise Candidate — Active Development

BEGIN;

-- Tenant A
INSERT INTO tenants (id, name, slug, is_fixture)
VALUES (
  'aaaaaaaa-0000-4000-a000-000000000001',
  'Fixture Tenant Alpha',
  'fixture-alpha',
  true
) ON CONFLICT (id) DO NOTHING;

-- Tenant B
INSERT INTO tenants (id, name, slug, is_fixture)
VALUES (
  'bbbbbbbb-0000-4000-b000-000000000002',
  'Fixture Tenant Beta',
  'fixture-beta',
  true
) ON CONFLICT (id) DO NOTHING;

-- Role: member (tenant A)
INSERT INTO roles (id, tenant_id, name)
VALUES (
  'aaaaaaaa-0000-4000-a000-000000000010',
  'aaaaaaaa-0000-4000-a000-000000000001',
  'member'
) ON CONFLICT DO NOTHING;

-- Role: member (tenant B)
INSERT INTO roles (id, tenant_id, name)
VALUES (
  'bbbbbbbb-0000-4000-b000-000000000010',
  'bbbbbbbb-0000-4000-b000-000000000002',
  'member'
) ON CONFLICT DO NOTHING;

-- User Alpha (belongs to Tenant A)
INSERT INTO users (id, email, password_hash, is_fixture)
VALUES (
  'aaaaaaaa-0000-4000-a000-000000000101',
  'user_alpha@fixture.test',
  -- argon2id hash of "fixture-password-alpha"
  '$argon2id$v=19$m=65536,t=3,p=4$YWxwaGFzYWx0YWxwaGE$jFv3SrVjwh+4VABpjnbFxFr0WdlUW/2xqnm3c3FXFR8',
  true
) ON CONFLICT (id) DO NOTHING;

-- User Beta (belongs to Tenant B)
INSERT INTO users (id, email, password_hash, is_fixture)
VALUES (
  'bbbbbbbb-0000-4000-b000-000000000102',
  'user_beta@fixture.test',
  -- argon2id hash of "fixture-password-beta"
  '$argon2id$v=19$m=65536,t=3,p=4$YmV0YXNhbHRiZXRhMQ$k9bMlhqAFZfZWkCfXGE6RuWGkXGvJjb2n2FXqKE8RnM',
  true
) ON CONFLICT (id) DO NOTHING;

-- Membership: User Alpha -> Tenant A
INSERT INTO memberships (id, tenant_id, user_id, role_id)
VALUES (
  'aaaaaaaa-0000-4000-a000-000000000201',
  'aaaaaaaa-0000-4000-a000-000000000001',
  'aaaaaaaa-0000-4000-a000-000000000101',
  'aaaaaaaa-0000-4000-a000-000000000010'
) ON CONFLICT DO NOTHING;

-- Membership: User Beta -> Tenant B
INSERT INTO memberships (id, tenant_id, user_id, role_id)
VALUES (
  'bbbbbbbb-0000-4000-b000-000000000202',
  'bbbbbbbb-0000-4000-b000-000000000002',
  'bbbbbbbb-0000-4000-b000-000000000102',
  'bbbbbbbb-0000-4000-b000-000000000010'
) ON CONFLICT DO NOTHING;

COMMIT;
