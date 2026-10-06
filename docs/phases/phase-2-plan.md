# Phase 2 Plan — Identity, Tenancy, RLS, Audit

**Status:** Enterprise Candidate — Active Development
**Phase:** 2 of 10

---

## In-Scope Items

### PostgreSQL Schema
- Tables: `tenants`, `users`, `memberships`, `roles`, `projects`, `audit_events`
- Row-Level Security (RLS) with USING and WITH CHECK policies on all tenant-scoped tables
- Unset `app.current_tenant_id` must fail closed (return no rows, not an error bypass)
- Tenant context is derived server-side from membership; set transaction-locally via `SET LOCAL`
- Forward-only SQL migration file: `packages/db/migrations/001_identity_tenancy_rls.sql`

### Authentication
- argon2id password hashing via `@node-rs/argon2`
- Login endpoint: `POST /auth/login` — validates credentials, sets session cookie
- Logout endpoint: `POST /auth/logout` — clears cookie
- Cookie flags: `httpOnly`, `Secure`, `SameSite=Lax`
- Session is server-derived tenant context (membership lookup); not from client-supplied field

### Object Storage Local Driver
- Key prefix: `{tenant_id}/{path}`
- Reject path traversal (any `..` segment)
- Dev/test only; no cloud SDK

### Logger
- Redacts secret-shaped strings: tokens, passwords, hashes (≥ 40 hex chars, bearer tokens, argon2 hashes)
- Does not log raw documents or full prompts

### Docker Compose
- `docker-compose.yml` at repository root
- Services: `postgres` (16) and `redis` (7) only
- No application services in this file

### Fixture Seed
- Two tenants (marked fixture)
- Two users (one per tenant, marked fixture)
- Memberships establishing each user in their tenant

### Tests (Vitest)
- Tenant A cannot read tenant B rows (RLS enforcement)
- Missing `app.current_tenant_id` returns no rows from tenant-scoped tables
- Path traversal rejected by storage driver
- Cookie flags verified on login response
- `audit_events` update and delete denied by policy

---

## Out of Scope

- SSO / OAuth
- Source document upload (Phase 3)
- Agents and LLM calls (Phase 5+)
- Billing, audio, regulated autonomy (deferred per directive)

---

## Files to Create or Modify

| Path | Action |
|---|---|
| `docs/phases/phase-2-plan.md` | Create (this file) |
| `packages/db/migrations/001_identity_tenancy_rls.sql` | Create |
| `packages/db/src/client.ts` | Create |
| `packages/db/src/migrate.ts` | Create |
| `packages/db/src/tenant-context.ts` | Create |
| `packages/db/src/index.ts` | Update (export new modules) |
| `packages/db/package.json` | Update (add `pg`, `@node-rs/argon2`, `uuid` deps; vitest for tests) |
| `packages/contracts/src/auth.ts` | Create |
| `packages/contracts/src/index.ts` | Update |
| `packages/contracts/package.json` | Update (add `zod`) |
| `apps/api/src/auth.ts` | Create |
| `apps/api/src/storage.ts` | Create |
| `apps/api/src/logger.ts` | Create |
| `apps/api/src/router.ts` | Update (add auth routes) |
| `apps/api/package.json` | Update (add deps) |
| `docker-compose.yml` | Create |
| `packages/db/seed/fixture.sql` | Create |
| `packages/db/src/auth.test.ts` | Create |
| `packages/db/src/rls.test.ts` | Create |
| `apps/api/src/storage.test.ts` | Create |
| `apps/api/src/auth.test.ts` | Create |
| `docs/phases/phase-2-report.md` | Create (at end of phase) |

---

## Gate

```
pnpm typecheck
pnpm test
pnpm lint
```

All must exit 0. Commit only if gate passes.
