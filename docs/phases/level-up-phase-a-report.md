# Level Up — Phase A Report — Live Surface

Status: Enterprise Candidate — Active Development

Label: Render candidate — not production.

## Scope

Phase A — LIVE SURFACE from the Level Up directive:

1. Apply `render.yaml`.
2. Run migrations before the API serves traffic.
3. Inject `DATABASE_URL`.
4. Auth must not stay 503 once the database is connected.
5. Record the real web, api, and `/docs` URLs in the README link package.
   No invented URL.
6. If deploy cannot run here, write the exact blocker and stop.
7. Label, exact: "Render candidate — not production".
8. Gate: `pnpm typecheck`, `pnpm test`, `pnpm lint` exit 0. Stop.

## Verification of existing state

All Phase A items were already built during Release R2 (Render Deploy) and
verified in this session. The directive says: "If something already exists,
verify it and do not redo it." No source was modified for this phase.

### render.yaml

`render.yaml` exists at the repo root and defines:

- **Database**: `alinamatrix-db` (Render-managed PostgreSQL 16, `plan: starter`).
- **API service**: `alinamatrix-api` (web, `plan: starter`, `region: oregon`).
  - `buildCommand`: `pnpm install --frozen-lockfile && pnpm --filter @alinamatrix/api build`
  - `preDeployCommand`: `SUPERUSER_URL=$DATABASE_URL node scripts/ci-migrate.mjs`
  - `startCommand`: `node dist/server.js`
  - `healthCheckPath`: `/health`
  - Env: `DATABASE_URL` via `fromDatabase` reference (no secret committed).
- **Web service**: `alinamatrix-web` (web, `plan: starter`, `region: oregon`).
  - `buildCommand`: `pnpm install --frozen-lockfile && pnpm --filter @alinamatrix/web build`
  - `startCommand`: `pnpm --filter @alinamatrix/web start`
  - `healthCheckPath`: `/`
  - Env: `NEXT_PUBLIC_API_BASE_URL`, `NODE_ENV=production`.

Label: `# Render candidate — not production.` — line 2 of `render.yaml`.

### Migrations before the API serves traffic

`apps/api/src/server.ts` (lines 37–49):

- Reads `process.env["DATABASE_URL"]`.
- If set: calls `runMigrations(pool, migrationsDir)` before
  `server.listen()`.
- If migrations fail: calls `pool.end()` and `process.exit(1)` — the server
  does not serve traffic.
- If `DATABASE_URL` is not set (local dev): the server starts without a DB
  and routes return 503.

### Inject DATABASE_URL / auth must not stay 503

`server.ts` injects `createPoolAuthDb(pool)` into the router (line 55).
The router (`apps/api/src/router.ts`) checks `if (!authDb)` and returns 503
only when the dependency is absent. With `DATABASE_URL` set and migrations
succeeded, `authDb` is always provided — auth routes serve traffic instead
of returning 503.

### README link package — no invented URL

`README.md` Links section (lines 302–315):

- Repository root: real GitHub URL (`github.com/aminbita162-glitch/AlinaMatrix-Enterprise`, verified via `git remote -v`).
- `/docs` (Swagger UI) and `/openapi.json` are labelled "served by `apps/api` at runtime" — not browseable on GitHub.
- Footer note: "No invented live URL is listed."
- No `*.onrender.com` URL is listed, because the deploy has not run. No URL
  is invented.

## Deploy blocker

Deploy cannot run in this environment. The exact blocker:

- No Render account or API key is configured in this environment.
- No live PostgreSQL instance is provisioned.
- `render.yaml` is the blueprint; it has not been deployed.

No real web, api, or `/docs` URL exists to record. The README link package
correctly lists no invented live URL — `/docs` and `/openapi.json` are
labelled as runtime-served paths, not as deployed URLs. No live result is
fabricated.

## Gate checks

| Check | Command | Exit code |
|-------|---------|-----------|
| Typecheck | `pnpm typecheck` | 0 |
| Test | `pnpm test` | 0 |
| Lint | `pnpm lint` | 0 |

## Test counts

| Package | Passed | Skipped |
|---------|--------|---------|
| packages/domain | 439 | 2 |
| packages/db | 323 | 101 |
| packages/renderer | 86 | 0 |
| apps/api | 90 | 0 |
| **Total** | **938** | **103** |

Integration tests (`.integration.test.ts`) are skipped without
`DATABASE_URL` + `SUPERUSER_URL`. They are not failed. A skipped test is not
passed. 101 of 103 skipped are integration tests; the remaining 2 are
`describe.skipIf` model tests gated on an API key not set in this environment.

## Requirements matrix

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Apply `render.yaml` | Verified | `render.yaml` at repo root; `databases:` + `services:` shape |
| Migrations before serve | Verified | `apps/api/src/server.ts:42` — `runMigrations` before `server.listen` |
| Inject `DATABASE_URL` | Verified | `render.yaml:37–39` — `fromDatabase` reference; `server.ts:29` reads env |
| Auth not 503 when DB connected | Verified | `server.ts:55` — `createPoolAuthDb(pool)` injected into router |
| README links — no invented URL | Verified | `README.md:315` — no `onrender` URL; runtime paths only |
| Label: "Render candidate — not production" | Verified | `render.yaml:2` |
| Deploy blocker if deploy cannot run | Recorded | No Render account; no live DB; blueprint not deployed |
| Gate exit 0 | Verified | typecheck 0, test 0, lint 0 |

## Residual risks

1. **Deploy not run.** No live Render service exists. The blueprint is a
   candidate, not a production deployment. No live URL is recorded.
2. **Integration tests skipped.** 101 integration tests are skipped without
   a live `DATABASE_URL` + `SUPERUSER_URL`. The gate is green on unit tests
   only; integration coverage is not proven in this environment.
3. **`/docs` and `/openapi.json` not reachable.** They are served by the API
   at runtime. No deployed URL exists to verify them.

## Files changed

| File | Change |
|------|--------|
| `docs/phases/level-up-phase-a-report.md` | new — this report |

No source, tests, migrations, `render.yaml`, `README.md`, or `DIRECTIV.txt`
were modified for this phase. All Phase A items were already built during
Release R2 and verified in place.
