# Test Home — AlinaMatrix Enterprise

> **Enterprise Candidate — Active Development**
> No production claim is made.

This page lists every test suite executed by the gate, the raw test counts,
and which tests are skipped (and why). A skipped test is not passed — it is
recorded here honestly.

## Gate commands

```bash
pnpm typecheck   # pnpm -r typecheck — all packages, exit 0
pnpm test        # pnpm -r test — Vitest per package, exit 0
pnpm lint        # eslint . --max-warnings 0, exit 0
```

All three must exit 0 before any commit.

## Last gate run

- **Date:** 2026-10-17
- **typecheck:** exit 0
- **test:** exit 0 — 1043 passed, 103 skipped
- **lint:** exit 0

## Raw results by package

### apps/api — 90 passed, 0 skipped

| Suite | Tests | Status |
|-------|-------|--------|
| `logger.test.ts` | 5 | passed |
| `storage.test.ts` | 11 | passed |
| `ingest.test.ts` | 15 | passed |
| `router.test.ts` | 8 | passed |
| `review.test.ts` | 29 | passed |
| `auth.test.ts` | 22 | passed |
| **Total** | **90** | **passed** |

### packages/domain — 544 passed, 2 skipped

| Suite | Tests | Status |
|-------|-------|--------|
| `architect.test.ts` | 22 | passed |
| `agents.test.ts` | 51 | passed |
| `assumption-register.test.ts` | 21 | passed |
| `budget.test.ts` | 12 | passed |
| `claims.test.ts` | 35 | passed |
| `consensus.test.ts` | 42 | passed |
| `export.test.ts` | 15 | passed |
| `generate.test.ts` | 25 | passed |
| `golden.test.ts` | 9 | passed |
| `guard.test.ts` | 37 | passed |
| `live-model.test.ts` | 21 | 2 skipped (no API key) |
| `negative-evidence.test.ts` | 22 | passed |
| `numeric-reconciliation.test.ts` | 19 | passed |
| `pinned-model.test.ts` | 39 | passed |
| `provenance.test.ts` | 24 | passed |
| `quote-lock-release.test.ts` | 13 | passed |
| `release.test.ts` | 29 | passed |
| `review.test.ts` | 28 | passed |
| `reviewer-diff.test.ts` | 16 | passed |
| `revocation.test.ts` | 8 | passed |
| `template.test.ts` | 19 | passed |
| `timetravel.test.ts` | 15 | passed |
| `trace.test.ts` | 12 | passed |
| `workflow.test.ts` | 12 | passed |
| **Total** | **544 passed, 2 skipped** | |

### packages/db — 323 passed, 101 skipped

| Suite | Tests | Status |
|-------|-------|--------|
| `agents.test.ts` | 38 | passed |
| `audit.test.ts` | 5 | passed |
| `budget.test.ts` | 20 | passed |
| `claims.test.ts` | 28 | passed |
| `consensus.test.ts` | 21 | passed |
| `export-audit.test.ts` | 14 | passed |
| `injection.test.ts` | 10 | passed |
| `m03.test.ts` | 22 | passed |
| `provenance.test.ts` | 18 | passed |
| `release.test.ts` | 22 | passed |
| `render.test.ts` | 27 | passed |
| `revocation.test.ts` | 17 | passed |
| `review.test.ts` | 36 | passed |
| `rls.test.ts` | 8 | passed |
| `sources.test.ts` | 19 | passed |
| `trace.test.ts` | 18 | passed |
| `agents.integration.test.ts` | 24 | 24 skipped (no DATABASE_URL) |
| `claims.integration.test.ts` | 35 | 35 skipped (no DATABASE_URL) |
| `rls.integration.test.ts` | 14 | 14 skipped (no DATABASE_URL) |
| `sources.integration.test.ts` | 28 | 28 skipped (no DATABASE_URL) |
| **Total** | **323 passed, 101 skipped** | |

### packages/renderer — 86 passed, 0 skipped

| Suite | Tests | Status |
|-------|-------|--------|
| `beachhead.test.ts` | 15 | passed |
| `html.test.ts` | 19 | passed |
| `manifest.test.ts` | 14 | passed |
| `pdf.test.ts` | 13 | passed |
| `replay.test.ts` | 17 | passed |
| `watermark.test.ts` | 8 | passed |
| **Total** | **86** | **passed** |

## Skipped live tests (not passed)

| Suite | Tests skipped | Reason |
|-------|--------------|-------|
| `packages/domain/src/live-model.test.ts` | 2 | Requires `OPENAI_API_KEY` for a live model call |
| `packages/db/src/agents.integration.test.ts` | 24 | Requires live PostgreSQL with `DATABASE_URL` and `SUPERUSER_URL` |
| `packages/db/src/sources.integration.test.ts` | 28 | Requires live PostgreSQL with `DATABASE_URL` and `SUPERUSER_URL` |
| `packages/db/src/claims.integration.test.ts` | 35 | Requires live PostgreSQL with `DATABASE_URL` and `SUPERUSER_URL` |
| `packages/db/src/rls.integration.test.ts` | 14 | Requires live PostgreSQL with `DATABASE_URL` and `SUPERUSER_URL` |

**Total skipped: 103.** These are skipped — not failed, not passed. The 101
integration tests require a live PostgreSQL instance; the 2 live-model tests
require an OpenAI API key. Neither is available in the default environment.

## Skipped live LLM tests

No live LLM call is made. `LiveModelProvider` in
`packages/domain/src/live-model.ts` is implemented and tested, but the
2 tests that would make a real `fetch` to an OpenAI-compatible endpoint are
skipped because `OPENAI_API_KEY` is not set in this environment. All other
agent outputs use `DeterministicFakeProvider` (directive R07). Determinism is
structural, not semantic — no real model call has been recorded.

## What the golden suite covers

The golden suite (`packages/domain/src/golden.test.ts`) runs six golden
fixtures and writes `docs/eval/m03-latest.md` from the results:

1. Happy ADR — standard M03 architect plan.
2. Contradiction — contradiction forces `NEEDS_REVIEW`.
3. Prompt injection — injected source text does not change the plan.
4. Missing citation — unsupported claim blocks ready.
5. Unit mismatch — numeric reconciliation flag.
6. Cross-tenant attempt — cache key differs per tenant.

## Open limitations

- **Beachhead not yet proven.** M03 pipeline is scaffolded; end-to-end
  execution requires a live PostgreSQL instance.
- **Integration tests skipped.** 101 integration tests require a live
  PostgreSQL instance. They are skipped — not failed, not passed.
- **No live LLM.** `LiveModelProvider` is implemented; the 2 live-call tests
  are skipped (no API key). All other agent outputs use
  `DeterministicFakeProvider`. No real model call has been recorded.
- **PDF is built.** `renderPdf()` in `packages/renderer/src/pdf.ts` emits real
  `%PDF-` bytes via pdfkit@0.20.2 (13 tests in `pdf.test.ts`). The PDF
  renderer is pure-JS, offline, and deterministic at the content-hash level.
  Raw PDF bytes are non-deterministic at the byte level (creation date,
  object IDs) — the content sha256 provides the replay invariant.
- **Security coverage is unit-level.** Auth bypass, authz bypass, tenant
  breach, prompt injection, bad upload, XSS, and SQL injection are covered
  by unit tests with mock doubles — not by live integration tests.

---

Status: Enterprise Candidate — Active Development.
