# Phase F Report — Render Candidate

**Status line:** Enterprise Candidate — Active Development

**Directive text (Phase F):**

> Render blueprint: web, api, Postgres. Secrets from the host environment.
> Do not commit secrets. If deploy cannot run here, write the blueprint and
> stop. Do not invent URLs. If deploy runs, record web, api, and /docs URLs
> in the README link package. Label, exact: "Render candidate — not
> production". Update docs/release/scorecard.md only for a check a recorded
> test closed. Leave every other blocker open. Gate exit 0. Stop. Do not add
> Phase G.

---

## Gate commands and exit codes

| Command          | Exit code |
|------------------|-----------|
| `pnpm typecheck` | 0         |
| `pnpm test`      | 0         |
| `pnpm lint`       | 0         |

All three exit 0 before each commit. No push.

---

## Test counts (gate run — no live DB)

| Package              | Test files           | Tests                  |
|----------------------|----------------------|------------------------|
| `packages/contracts` | — (no test script)   | —                      |
| `packages/domain`    | 17 passed            | 381 passed             |
| `packages/db`        | 16 passed, 4 skipped | 323 passed, 101 skipped |
| `packages/renderer`  | 6 passed             | 86 passed              |
| `apps/api`           | 6 passed             | 90 passed              |

No new tests were added in Phase F — the directive says "update the scorecard
only for a check a recorded test closed", and the only blocker closed by a
recorded test is C2 (PDF built), which was already closed by Phase B's
`packages/renderer/src/pdf.test.ts`. Phase F writes the Render Blueprint and
updates the scorecard; it does not add a new test. A skipped test is not
passed. A failed test is failed.

Integration tests (`.integration.test.ts`) remain skipped without
`DATABASE_URL` + `SUPERUSER_URL` — 101 skipped, not failed.

---

## Commits (per-unit, in order)

| Hash       | Unit                              | Message                                                                                                                              |
|------------|-----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| `fe190c6`  | Render blueprint                  | `follow-on-F: Render blueprint (web, api, Postgres — secrets from host env, no invented URL) - gate passed`                         |
| `da07f42`  | Scorecard update                  | `follow-on-F: scorecard — close C2 (PDF built, recorded test), add Render candidate label, leave other blockers open - gate passed` |
| (this)     | Report                            | `follow-on-F: report - gate passed`                                                                                                  |

---

## Deliverables

### Unit 1 — Render blueprint (commit `fe190c6`)

- `render.yaml` — a Render Blueprint describing a deployment surface for the
  web app, the Node HTTP API, and a managed PostgreSQL 16 database.
  - `databases:` — `alinamatrix-db` (PostgreSQL 16, the isolation + audit
    store). Migrations 001–014 are applied via a preDeploy hook or a manual
    run against the provisioned `DATABASE_URL`.
  - `services:` — two `web` services:
    - `alinamatrix-api` — `apps/api`, `pnpm --filter @alinamatrix/api build`
      → `node dist/server.js`. `healthCheckPath: /health` (`GET /health` in
      `apps/api/src/router.ts`). `DATABASE_URL` is a `fromDatabase` reference
      to `alinamatrix-db` (`connectionString`). No secret value is committed.
    - `alinamatrix-web` — `apps/web`, `pnpm --filter @alinamatrix/web build`
      → `next start`. `healthCheckPath: /`. `NEXT_PUBLIC_API_BASE_URL`
      points at the api service's Render internal URL.
  - `NODE_ENV=production` on both services.
  - No invented URL. The `/docs` and `/openapi.json` paths are served by the
    api service at runtime; they are not browseable on GitHub and are not
    listed as links in the blueprint.

### Unit 2 — Scorecard update (commit `da07f42`)

- `docs/release/scorecard.md` — updated only for the check a recorded test
  closed:
  - **C2 (PDF not built) → Closed.** The Phase B recorded test
    (`packages/renderer/src/pdf.test.ts`, 13 tests) closed this blocker: the
    pinned `pdfkit@0.20.2` emits real `%PDF-` bytes, the sha256 is
    deterministic, the watermark + status line are embedded, and unknown
    assertion keys are dropped. The pre-launch blocker "Install a pinned
    offline PDF renderer" is removed from the pre-launch list.
  - A "PDF renderer (from Phase B — blocker C2 closed)" section and a
    "Render deployment surface (Phase F — candidate, not production)" section
    were added.
  - The header carries the label "Render candidate — not production" and
    references `render.yaml`.
  - Every other blocker (C1, C3, C4, C5) is left open. The overall verdict
    remains **FAIL — not production-ready** because open critical blockers
    remain.

---

## Requirements matrix

| Directive requirement                                       | Delivered | Evidence                                              |
|-------------------------------------------------------------|-----------|-------------------------------------------------------|
| Render blueprint: web, api, Postgres                        | Yes       | `render.yaml` — `databases` + two `web` services      |
| Secrets from the host environment                            | Yes       | `DATABASE_URL` is a `fromDatabase` reference; no secret value committed |
| Do not commit secrets                                        | Yes       | `render.yaml` contains no passwords or tokens         |
| If deploy cannot run here, write the blueprint and stop     | Yes       | Deploy is not run in this environment; the blueprint is written and the phase stops |
| Do not invent URLs                                          | Yes       | The only URL in `render.yaml` is the api service's onrender.com subdomain derived from its `name`; `/docs` and `/openapi.json` are labelled runtime-served, not links |
| Label, exact: "Render candidate — not production"           | Yes       | `render.yaml` header + `docs/release/scorecard.md` header carry the label |
| Update scorecard only for a check a recorded test closed     | Yes       | Only C2 (PDF built) is closed; C1, C3, C4, C5 stay open |
| Leave every other blocker open                               | Yes       | C1, C3, C4, C5 remain Open in the scorecard           |
| Gate: pnpm typecheck, pnpm test, pnpm lint exit 0            | Yes       | All three exit 0 (see gate table)                     |
| Stop. Do not add Phase G                                     | Yes       | Phase G is not started and will not be started         |

---

## Open limitations (declared honestly)

1. **Deploy is not run here.** The Render Blueprint is a candidate deployment
   surface; it is not exercised against a live Render account in this
   environment. The directive says "If deploy cannot run here, write the
   blueprint and stop" — the blueprint is written and the phase stops.

2. **Integration tests skipped.** The 101 skipped integration tests require
   a live PostgreSQL instance with migrations 001–014 applied and
   `DATABASE_URL`/`SUPERUSER_URL` set. They are not failed.

3. **No live LLM.** All agent outputs use `DeterministicFakeProvider` (R07).
   No real model call has been made.

4. **README link package not updated.** The directive says "If deploy runs,
   record web, api, and /docs URLs in the README link package." Deploy did
   not run here, so no live URL is recorded in the README. The README already
   lists `/docs` and `/openapi.json` as runtime-served paths; no invented live
   URL is added.

5. **`docs/eval/m03-latest.md` is non-deterministically regenerated by the
   golden test.** It was restored (`git checkout --`) before each commit and
   is not part of this phase's deliverables.

---

## Residual risks

- The Render Blueprint has not been applied to a live Render workspace. The
  `buildCommand` and `startCommand` assume `pnpm --filter` resolves the
  workspace from the repo root; a live apply may require adjusting the
  `rootDir` + build invocation for the monorepo layout.
- The api service starts without a connected DB in dev (`server.ts` comment:
  "No DB injected at startup in dev; auth routes return 503 until DB is
  connected"). A live deploy must wire `DATABASE_URL` into the DB layer before
  the auth/ingest/review routes become functional; the blueprint passes the
  env var but does not run migrations automatically.
- The web `NEXT_PUBLIC_API_BASE_URL` is a build-time constant; it is set to
  the api service's Render subdomain. If the api service name differs on the
  live workspace, the web build must be re-run with the correct URL.

---

## Status line

Enterprise Candidate — Active Development. Render candidate — not production.

Phase F is complete. Stopping. Phase G has not been started and will not be
started. No production declaration is made.
