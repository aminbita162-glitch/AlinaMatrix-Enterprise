# Release 2 Report — Render Deploy

Status: Enterprise Candidate — Active Development

Label: Render candidate — not production.

## Scope

R2 wired the Render deployment blueprint (`render.yaml`) to the live database
layer.  Pool-based `AuthDb`, `IngestDb`, and `ReviewDb` factories were added to
`apps/api/src/server.ts`; each acquires a client from the `pg.Pool` per
operation, sets tenant context where the tenant_id is known, and releases the
client back to the pool when the operation completes.  Migrations run before
the API serves traffic.

## Deploy blueprint

`render.yaml` defines:

- **Database**: `alinamatrix-db` (Render-managed PostgreSQL 16, plan: starter).
- **API service**: `alinamatrix-api` (web service, plan: starter, region: oregon).
  - `buildCommand`: `pnpm install --frozen-lockfile && pnpm --filter @alinamatrix/api build`
  - `preDeployCommand`: `SUPERUSER_URL=$DATABASE_URL node scripts/ci-migrate.mjs`
  - `startCommand`: `node dist/server.js`
  - `healthCheckPath`: `/health`
  - Env: `DATABASE_URL` (from database connection string), `NODE_ENV=production`.
- **Web service**: `alinamatrix-web` (web service, plan: starter, region: oregon).
  - `buildCommand`: `pnpm install --frozen-lockfile && pnpm --filter @alinamatrix/web build`
  - `startCommand`: `pnpm --filter @alinamatrix/web start`
  - `healthCheckPath`: `/`
  - Env: `NEXT_PUBLIC_API_BASE_URL`, `NODE_ENV=production`.

Migrations 001–014 are applied by the api `preDeployCommand`
(`scripts/ci-migrate.mjs`) before the API starts serving traffic.

## Migrations before serve

`apps/api/src/server.ts` reads `DATABASE_URL` from the environment, creates a
`pg.Pool` via `createPool`, and runs `runMigrations(pool, migrationsDir)` before
`server.listen()`.  If migrations fail, the server exits with code 1 and does
not serve traffic.  If `DATABASE_URL` is not set (local dev), the server starts
without DB and routes return 503.

## Pool-based DB layer

Three pool-based factories were added, one per domain:

| Factory | File | Operations |
|---------|------|------------|
| `createPoolAuthDb(pool)` | `apps/api/src/auth.ts` | findUserByEmail, findMembershipByUser, createSession, findSession, deleteSession, recordAuditEvent |
| `createPoolIngestDb(pool)` | `apps/api/src/ingest.ts` | insertSource, upsertSourceVersion, setVersionStatus, insertSourceFragments, recordAuditEvent |
| `createPoolReviewDb(pool)` | `apps/api/src/review.ts` | insertReviewTask, getReviewTask, listOpenReviewTasks, updateReviewTaskState, insertApproval, listApprovalsByTask, insertComment, listCommentsByTask |

Each operation:

1. Acquires a client from the pool (`pool.connect()`).
2. Begins a transaction (`BEGIN`).
3. Sets tenant context (`setTenantContext`) where the tenant_id is known.
4. Runs the operation.
5. Commits (`COMMIT`) and releases the client (`client.release()`).
6. On error: rolls back (`ROLLBACK`), releases the client, and rethrows.

The shared helper `withPoolClient` lives in `apps/api/src/db-pool.ts`.

Auth must not stay 503 once the database is connected: `server.ts` injects
`authDb`, `ingestDb`, `reviewDb`, and `storage` into the router.  All routes
that previously returned 503 when their dependency was absent now receive the
pool-based dependency and serve traffic.

## Object storage

`createLocalStorage(STORAGE_DIR)` is used for object storage.  `STORAGE_DIR`
defaults to `apps/api/storage` locally; on Render it can be mounted as a disk.

## Deploy URLs

Deploy cannot run in this environment — no Render account or live database is
available here.  The exact blocker:

- No Render account or API key is configured in this environment.
- No live PostgreSQL instance is provisioned.
- `render.yaml` is the blueprint; it has not been deployed.

The `/docs` and `/openapi.json` paths are served by the api service at runtime;
they are not browseable on GitHub.  No URL is invented.

## Gate checks

| Check | Exit code |
|-------|-----------|
| `pnpm typecheck` | 0 |
| `pnpm test` | 0 |
| `pnpm lint` | 0 |

## Files changed

| File | Change |
|------|--------|
| `render.yaml` | preDeployCommand added; migration comment updated |
| `apps/api/src/server.ts` | pool-based DB injection; migrations before serve |
| `apps/api/src/db-pool.ts` | new — `withPoolClient` helper (acquire, BEGIN, tenant context, COMMIT/ROLLBACK, release) |
| `apps/api/src/auth.ts` | `createPoolAuthDb` factory added |
| `apps/api/src/ingest.ts` | `createPoolIngestDb` factory added |
| `apps/api/src/review.ts` | `createPoolReviewDb` factory added |
| `docs/phases/release-2-report.md` | this report |
