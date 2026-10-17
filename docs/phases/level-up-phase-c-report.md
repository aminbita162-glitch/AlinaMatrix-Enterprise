# Level Up — Phase C Report: Live Security

**Status:** Enterprise Candidate — Active Development

**Date:** 2026-10-17

**Phase:** Level Up — Phase C (Live Security)

**Label:** Render candidate — not production.

---

## Directive (verbatim)

> Against the deployed service: bad login, cross-tenant read, bad upload,
> rendered XSS. Record pass or fail. Do not close a threat-model item
> without a recorded live result. If no deployed service exists, write the
> exact blocker and stop. Do not invent a live result.
> Gate exit 0. Stop.

---

## Summary

Phase C requires live security checks **against the deployed service** for
four threats:

1. **Bad login** — authentication rejection at the live auth endpoint.
2. **Cross-tenant read** — a tenant-scoped read returning another tenant's
   data must be blocked by the live RLS policy.
3. **Bad upload** — a malformed/malicious upload must be rejected by the
   live ingest path (MIME, magic bytes, size cap).
4. **Rendered XSS** — a payload rendered into HTML must be escaped so it
   does not execute against the live renderer.

No deployed service exists in this environment. Per the directive, the exact
blocker is recorded below and the phase stops. **No live result is invented.**
No threat-model item (C4) is closed — closing it requires a recorded live
result, and none exists. The gate (`pnpm typecheck`, `pnpm test`,
`pnpm lint`) passes with exit 0 on unit tests.

---

## Deploy Blocker (exact)

The deployed service does not exist. The exact blocker, carried forward from
Level Up Phase A (verified again in this session):

1. **No Render account or API key.** `RENDER_API_KEY` is not set
   (`echo` output: `RENDER_API_KEY set: no`). `render.yaml` is the blueprint;
   it has not been applied via the Render API or dashboard.
2. **No live PostgreSQL instance.** `DATABASE_URL` is not set
   (`echo` output: `DATABASE_URL set: no`). No live database is provisioned
   for this project.
3. **No live web or API URL.** No `*.onrender.com` URL has been created.
   The API service (`alinamatrix-api`), the web service (`alinamatrix-web`),
   and the PostgreSQL 16 database (`alinamatrix-db`) are defined in
   `render.yaml` but have **not been deployed**.
4. **`/docs` and `/openapi.json` are runtime-served, not browseable.** They
   are served by `apps/api` at runtime when the API is live. With no deployed
   API, they are not reachable.

No live endpoint is available to run any of the four security checks against.
The checks below are **not recorded as live results** — they are listed as the
intended live checks that could not run, so the directive does not mistake
absence for pass.

---

## Intended live checks (not run — no deployed service)

| # | Threat | Intended live check | Live result |
|---|--------|---------------------|-------------|
| 1 | Bad login | `POST /auth/login` with a wrong password / unknown email / user with no tenant membership must return 401 (not 200, not 500) against the live API | **Not run.** No live API. |
| 2 | Cross-tenant read | A request scoped to tenant A must not read tenant B's claims / sources / jobs / review tasks. Verified via a live RLS policy on PostgreSQL 16, not a mock. | **Not run.** No live DB. |
| 3 | Bad upload | `POST /ingest` with a MIME mismatch, a size cap violation, or a DOCX with bad magic bytes must return a rejection (not `EXTRACTED`) from the live ingest path. | **Not run.** No live API. |
| 4 | Rendered XSS | A payload containing `<script>alert('xss')</script>` rendered into M03 HTML must be escaped — the live HTML must not contain the raw `<script>` tag. | **Not run.** No live renderer endpoint. |

No entry in this table is a recorded pass or fail. Each is the planned check
that the directive names, listed so the blocker is explicit. A recorded live
result is the only thing that could close C4 — none exists.

---

## Threat-model item (C4) — not closed

The scorecard (`docs/release/scorecard.md`) lists C4 as:

> Security coverage is unit-level only — Open — Auth bypass, authz bypass,
> tenant breach, prompt injection, bad upload, XSS, and SQL injection are
> covered by unit tests with mock doubles — not by live integration tests.

Phase C does **not** close C4. The directive is explicit: "Do not close a
threat-model item without a recorded live result." No live result was recorded
this phase — the deployed service does not exist. C4 stays **Open**.

The four Phase C threats correspond to the following existing **unit-level**
coverage, which remains unit-level only (not live):

| Threat | Unit-level test | Path |
|--------|-----------------|------|
| Bad login | `apps/api/src/auth.test.ts` (22 tests) | login returns null for wrong password / unknown email / no membership; cookie flags verified |
| Cross-tenant read | `packages/db/src/rls.test.ts`, `packages/db/src/claims.test.ts` | `setTenantContext` validates UUID; cross-tenant `getClaim` returns null under RLS |
| Bad upload | `apps/api/src/ingest.test.ts` (15 tests) | MIME mismatch rejected, size cap enforced, bad-magic DOCX → `FAILED_TERMINAL` |
| Rendered XSS | `packages/renderer/src/html.test.ts` | `<script>alert('xss')</script>` does not appear in rendered HTML |

These are unit tests with mock doubles — exactly the coverage C4 says is
insufficient for closing. Phase C does not upgrade them to live results.

---

## Unit-level coverage (verified in place)

The directive says "If something already exists, verify it and do not redo it."
The four security threats already have unit-level test coverage from prior
phases. This phase verified that coverage exists and passes, but did not
modify it — no source or test files were changed.

### Bad login — `apps/api/src/auth.test.ts`

- 22 tests, all passing (`pnpm test` exit 0).
- Login returns null for: wrong password, unknown email, user with no tenant
  membership.
- Session resolution and cookie flags verified.
- This is unit-level (mock `AuthDb`). Not a live check.

### Cross-tenant read — `packages/db/src/rls.test.ts`, `packages/db/src/claims.test.ts`

- `setTenantContext` validates the tenant UUID and rejects SQL injection in
  the tenant_id.
- `getClaim` returns null when RLS excludes a cross-tenant row (mock client).
- `packages/db/src/claims.integration.test.ts` exercises the cross-tenant
  RLS contract against a live PostgreSQL 16 — but it is an **integration
  test, skipped** without `DATABASE_URL` + `SUPERUSER_URL`. 101 integration
  tests are skipped in this environment. A skipped test is not passed.

### Bad upload — `apps/api/src/ingest.test.ts`

- 15 tests, all passing.
- MIME mismatch rejected, size cap enforced, bad-magic DOCX →
  `FAILED_TERMINAL`.
- Unit-level (mock storage). Not a live check.

### Rendered XSS — `packages/renderer/src/html.test.ts`

- `<script>alert('xss')</script>` payload does not appear in the rendered HTML
  (test at `html.test.ts:195-200`).
- All rendered values are escaped (`packages/renderer/src/html.ts`).
- Unknown assertion keys dropped (`packages/renderer/src/replay.test.ts`).
- Unit-level (renderer). Not a live check.

---

## Gate Results

| Command | Exit Code | Notes |
|---------|-----------|-------|
| `pnpm typecheck` | 0 | 6 workspace projects — all `tsc --noEmit` pass |
| `pnpm test` | 0 | 938 passed, 103 skipped (101 integration + 2 live-model real-call) |
| `pnpm lint` | 0 | `eslint . --max-warnings 0` — clean |

### Test counts (per package)

| Package | Tests | Skipped |
|---------|-------|---------|
| `packages/domain` | 439 passed | 2 skipped (live-model real call — no API key) |
| `packages/db` | 323 passed | 101 skipped (integration — no `DATABASE_URL` + `SUPERUSER_URL`) |
| `packages/renderer` | 86 passed | 0 |
| `apps/api` | 90 passed | 0 |
| **Total** | **938 passed** | **103 skipped** |

A skipped test is not passed. The 101 skipped integration tests include the
cross-tenant RLS contract tests (`claims.integration.test.ts`,
`agents.integration.test.ts`, `sources.integration.test.ts`) that would
constitute the live cross-tenant read check — they are skipped because no live
PostgreSQL is provisioned. Phase C does not claim them as live results.

---

## Requirements Matrix

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Against the deployed service | **Blocked** | No deployed service — no Render account (`RENDER_API_KEY` not set), no live PostgreSQL (`DATABASE_URL` not set), no `*.onrender.com` URL |
| Bad login | **Not run (no live API)** | Intended: `POST /auth/login` wrong password / unknown email / no membership → 401. No live endpoint. |
| Cross-tenant read | **Not run (no live DB)** | Intended: tenant A cannot read tenant B via live RLS on PostgreSQL 16. No live database. Integration test skipped. |
| Bad upload | **Not run (no live API)** | Intended: `POST /ingest` MIME / size / magic-bytes rejection. No live endpoint. |
| Rendered XSS | **Not run (no live renderer)** | Intended: `<script>` payload escaped in live HTML. No live renderer endpoint. |
| Record pass or fail | **Recorded: not run** | No live result. Blocker recorded. No pass or fail invented. |
| Do not close a threat-model item without a recorded live result | **Honored** | C4 stays Open. No live result recorded. |
| If no deployed service exists, write the exact blocker and stop | **Honored** | Blocker written above. Phase stops. |
| Do not invent a live result | **Honored** | No live URL, score, pass, or fail is invented. |
| Gate exit 0 | **Verified** | typecheck 0, test 0, lint 0 |

---

## What Changed

Nothing. Per the directive, no deployed service exists, so the exact blocker
is recorded and the phase stops. No source, test, migration, `render.yaml`,
`README.md`, `scorecard.md`, or `DIRECTIV.txt` was modified. C4 is not
closed. The only artifact produced this phase is this report.

The scorecard (`docs/release/scorecard.md`) is **not** modified. C4 stays
Open. The overall verdict stays **FAIL — not production-ready.** No
threat-model item is closed without a recorded live result.

---

## Residual Risks

1. **No deployed service.** No live Render web, API, or PostgreSQL instance
   exists. The blueprint (`render.yaml`) is a candidate, not a deployment.
   No live URL is recorded.
2. **C4 stays Open.** Security coverage remains unit-level only. Auth bypass,
   authz bypass, tenant breach, prompt injection, bad upload, XSS, and SQL
   injection are covered by unit tests with mock doubles — not by live
   integration tests. No live result was recorded this phase.
3. **101 integration tests skipped.** The cross-tenant RLS contract tests
   (`claims.integration.test.ts`, `agents.integration.test.ts`,
   `sources.integration.test.ts`) are skipped without `DATABASE_URL` +
   `SUPERUSER_URL`. A skipped test is not passed. They are not recorded as
   live results.
4. **No live API key.** `OPENAI_API_KEY` is not set (Phase B blocker). The
   live model call is blocked independently of the deploy blocker. Phase C
   does not depend on the model key, but notes it as a separate blocker.

---

## Honest Status

- **Deployed service:** Does not exist. `render.yaml` is a blueprint, not a
  deployment. No live URL.
- **Live security checks:** Not run. No deployed service to run them against.
- **Threat-model C4:** Open. Not closed. No recorded live result.
- **Unit-level coverage:** Exists and passes (938 passed). Unit-level is not
  live.
- **Candidate:** Maintained. Not production. A small test count is not proof
  of real-world capacity.
- **Status line:** Enterprise Candidate — Active Development.

---

## Stop

Phase C complete. Gate passed. No deployed service exists — the exact blocker
is recorded above. No live result is invented. C4 stays Open. Do not start
Phase D.
