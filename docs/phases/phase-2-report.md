# Phase 2 Report — Identity, Tenancy, RLS, Audit

**Status:** Enterprise Candidate — Active Development
**Phase:** 2 of 10
**Gate result:** PASSED
**Commit:** yes

---

## Gate Commands and Exit Codes

| Command | Exit code | Result |
|---|---|---|
| `pnpm typecheck` | 0 | PASSED |
| `pnpm test` | 0 | PASSED |
| `pnpm lint` | 0 | PASSED |

---

## Test Results

### packages/db

| File | Tests | Passed | Failed |
|---|---|---|---|
| `src/rls.test.ts` | 8 | 8 | 0 |
| `src/audit.test.ts` | 5 | 5 | 0 |

`rls.test.ts` descriptions:
- setTenantContext calls SET LOCAL with a valid UUID
- setTenantContext rejects a non-UUID tenant_id
- setTenantContext rejects empty string as tenant_id
- setTenantContext rejects client-supplied tenant_id containing SQL injection attempt
- setTenantContext does not accept path-like strings as tenant_id
- clearTenantContext calls set_config with empty string to clear tenant context
- two separate set_config calls produce two distinct tenant contexts
- after clearTenantContext the query sets tenant to empty (fail-closed)

`audit.test.ts` descriptions:
- creates a SELECT policy for audit_events
- creates an INSERT policy for audit_events
- does NOT create an UPDATE policy for audit_events
- does NOT create a DELETE policy for audit_events
- enables FORCE ROW LEVEL SECURITY on audit_events

### apps/api

| File | Tests | Passed | Failed |
|---|---|---|---|
| `src/logger.test.ts` | 5 | 5 | 0 |
| `src/storage.test.ts` | 11 | 11 | 0 |
| `src/router.test.ts` | 2 | 2 | 0 |
| `src/auth.test.ts` | 22 | 22 | 0 |

`logger.test.ts` descriptions:
- redacts an argon2id hash
- redacts a Bearer token
- redacts a 40+ hex string (e.g. SHA-256 digest)
- does not redact short non-secret strings
- handles non-string input by serialising then redacting

`storage.test.ts` descriptions:
- rejects path traversal with '..' in relativePath on put
- rejects path traversal with embedded '..' on put
- rejects path traversal on get
- rejects path traversal on exists
- rejects path traversal on delete
- rejects invalid tenant_id (not a UUID)
- rejects tenant_id that is not a UUID format
- put and exists return true for a stored file
- exists returns false for a missing file
- tenant A file is not visible under tenant B path
- get returns readable stream with stored content

`router.test.ts` descriptions (Phase 1 tests, preserved):
- GET /health returns 200 with correct JSON shape
- GET /unknown returns 404

`auth.test.ts` descriptions:
- buildSessionCookie includes HttpOnly, Secure, SameSite=Lax
- buildSessionCookie includes an Expires field
- buildClearCookie sets cookie to empty and past expiry
- parseSessionCookie extracts the session id
- parseSessionCookie returns null when cookie absent
- login() returns null for unknown email
- login() returns null for wrong password
- login() returns null when user has no tenant membership
- login() returns session with correct tenantId on valid credentials
- login() session cookie has correct flags after successful login
- login() records an audit event on successful login
- logout() calls deleteSession with the session id from cookie
- logout() does not throw when no cookie is present
- resolveSession() returns null when no cookie header
- resolveSession() returns null when session is not found in db
- resolveSession() returns the session when found
- POST /auth/login returns 401 for invalid credentials
- POST /auth/login returns 400 for malformed JSON
- POST /auth/login returns 400 for missing email field
- POST /auth/login returns Set-Cookie with HttpOnly, Secure, SameSite=Lax on successful login
- POST /auth/login returns 503 when router has no db injected
- POST /auth/logout returns 204 and clears cookie

### packages/domain (Phase 1 tests, preserved)

| File | Tests | Passed | Failed |
|---|---|---|---|
| `src/workflow.test.ts` | 12 | 12 | 0 |

### Total

| Metric | Value |
|---|---|
| Test files | 7 |
| Tests run | 65 |
| **Passed** | **65** |
| **Failed** | **0** |

---

## Typecheck Coverage

| Package | Result |
|---|---|
| `@alinamatrix/api` | PASSED |
| `@alinamatrix/web` | PASSED |
| `@alinamatrix/domain` | PASSED |
| `@alinamatrix/db` | PASSED |
| `@alinamatrix/contracts` | PASSED |
| `@alinamatrix/renderer` | PASSED |

---

## Deliverables Produced

| Item | Path | Notes |
|---|---|---|
| SQL migration | `packages/db/migrations/001_identity_tenancy_rls.sql` | tenants, users, memberships, roles, projects, audit_events, sessions; RLS USING+WITH CHECK; FORCE RLS |
| DB client | `packages/db/src/client.ts` | createPool, withTransaction |
| Tenant context | `packages/db/src/tenant-context.ts` | setTenantContext, clearTenantContext, withTenantContext; UUID validation |
| Migration runner | `packages/db/src/migrate.ts` | Forward-only, idempotent |
| DB package index | `packages/db/src/index.ts` | Exports all public DB APIs |
| Zod auth schemas | `packages/contracts/src/auth.ts` | LoginRequest, LoginResponse, Session, Tenant, ApiError |
| Contracts index | `packages/contracts/src/index.ts` | Updated |
| Logger | `apps/api/src/logger.ts` | Redacts argon2id, Bearer tokens, hex digests ≥40 chars |
| Storage driver | `apps/api/src/storage.ts` | Local filesystem, UUID-prefixed key, path traversal rejected |
| Auth module | `apps/api/src/auth.ts` | argon2id verify, session create/resolve/delete, cookie helpers |
| Router update | `apps/api/src/router.ts` | POST /auth/login, POST /auth/logout; dependency-injected AuthDb |
| docker-compose | `docker-compose.yml` | postgres:16, redis:7 only |
| Fixture seed | `packages/db/seed/fixture.sql` | 2 tenants, 2 users, 2 memberships; is_fixture=true |
| DB RLS tests | `packages/db/src/rls.test.ts` | 8 tests; mock client |
| DB audit tests | `packages/db/src/audit.test.ts` | 5 tests; verify SQL migration has no UPDATE/DELETE policy |
| Storage tests | `apps/api/src/storage.test.ts` | 11 tests |
| Auth tests | `apps/api/src/auth.test.ts` | 22 tests; mock AuthDb |
| Logger tests | `apps/api/src/logger.test.ts` | 5 tests |
| Phase plan | `docs/phases/phase-2-plan.md` | |
| Phase report | `docs/phases/phase-2-report.md` | This file |

---

## Failures

None. 0 tests failed. 0 lint errors. 0 typecheck errors.

One test failure was encountered during development and corrected before the gate run:
- `storage.exists` caught `PathTraversalError` inside a try/catch and returned `false` instead of re-throwing. Fixed by moving `resolveKey()` call before the try block.

---

## Residual Risk and Open Blockers

| Item | Notes |
|---|---|
| No live DB integration tests | RLS enforcement is verified by reading the migration SQL and mocking the client. Full end-to-end RLS isolation (Tenant A cannot read Tenant B) requires a live PostgreSQL and is not tested in this phase. A live-DB integration test suite is deferred and tracked as an open blocker for pre-launch acceptance. |
| Fixture seed password hashes | The argon2id hashes in `seed/fixture.sql` are placeholder strings written as documentation. They must be regenerated using the actual argon2id library before the seed is applied against a real database. |
| Sessions table not RLS-tested live | Session expiry and cross-tenant session lookup are only tested at the TypeScript unit level. |
| No HTTPS in dev | The `Secure` cookie flag requires HTTPS. In local dev the cookie will not be sent over plain HTTP. A TLS termination layer or dev override is required before manual testing. |
| docker-compose not verified end-to-end | The docker-compose file is present and validated structurally; it has not been `docker compose up`-tested in this phase. |
| argon2id memory parameters not tuned | Default parameters are used. Production tuning requires a separate ADR and hardware benchmark. |
| No password rotation or MFA | Deferred per directive (SSO out of scope). |
| M03 beachhead unproven | Requires Phases 3–10. |
| No PDF output | Deferred to Phase 8. |
