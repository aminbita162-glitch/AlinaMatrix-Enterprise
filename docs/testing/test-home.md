# Test Home — AlinaMatrix Enterprise

> **Enterprise Candidate — Active Development**
> No production claim is made.

This page lists every test suite executed by the gate, the test counts, and
which tests are skipped (and why). A skipped test is not passed — it is
recorded here honestly.

## Gate commands

```bash
pnpm typecheck   # pnpm -r typecheck — all packages, exit 0
pnpm test        # pnpm -r test — Vitest per package, exit 0
pnpm lint        # eslint . --max-warnings 0, exit 0
```

All three must exit 0 before any commit.

## Executed test suites

| Package | Suite | Tests | Status |
|---------|-------|-------|--------|
| apps/api | `logger.test.ts` | 5 | passed |
| apps/api | `storage.test.ts` | 11 | passed |
| apps/api | `ingest.test.ts` | 15 | passed |
| apps/api | `router.test.ts` | 8 | passed |
| apps/api | `review.test.ts` | 29 | passed |
| apps/api | `auth.test.ts` | 22 | passed |
| packages/domain | `golden.test.ts` + all suites | 283 | passed |
| packages/db | `sources.test.ts` | 19 | passed |
| packages/db | `release.test.ts` | 22 | passed |
| packages/db | `claims.test.ts` | 28 | passed |
| packages/db | `render.test.ts` | 27 | passed |
| packages/db | `review.test.ts` | 36 | passed |
| packages/db | `budget.test.ts` | 20 | passed |
| packages/db | `m03.test.ts` | 22 | passed |
| packages/db | `revocation.test.ts` | 17 | passed |
| packages/db | `export-audit.test.ts` | 14 | passed |
| packages/db | `agents.test.ts` | 38 | passed |
| packages/db | `rls.test.ts` | 8 | passed |
| packages/db | `audit.test.ts` | 5 | passed |
| packages/db | `injection.test.ts` | 10 | passed |

**Total executed: 666 passed.** (Counts as of Phase A; the golden test
non-deterministically regenerates `docs/eval/m03-latest.md` on each run.)

## Skipped live tests (not passed)

| Suite | Tests skipped | Reason |
|-------|--------------|-------|
| `packages/db/src/agents.integration.test.ts` | 24 | Requires live PostgreSQL with `DATABASE_URL` and `SUPERUSER_URL` |
| `packages/db/src/sources.integration.test.ts` | 28 | Requires live PostgreSQL with `DATABASE_URL` and `SUPERUSER_URL` |
| `packages/db/src/claims.integration.test.ts` | 35 | Requires live PostgreSQL with `DATABASE_URL` and `SUPERUSER_URL` |
| `packages/db/src/rls.integration.test.ts` | 14 | Requires live PostgreSQL with `DATABASE_URL` and `SUPERUSER_URL` |

**Total skipped: 101.** These are skipped — not failed, not passed. They test
RLS policies, immutability triggers, and CHECK constraints against a live
PostgreSQL instance, which is not available in the default CI environment.

## Skipped live LLM tests

No live LLM call is made. All agent outputs use
`DeterministicFakeProvider` (directive R07). Determinism is structural, not
semantic — no real model call has been made. No test exercises a live model.

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
- **No PDF output.** PDF rendering is not built.
- **No live LLM.** All agent outputs use DeterministicFakeProvider.
- **Security coverage is unit-level.** Auth bypass, authz bypass, tenant
  breach, prompt injection, bad upload, XSS, and SQL injection are covered
  by unit tests with mock doubles — not by live integration tests.

---

Status: Enterprise Candidate — Active Development.
