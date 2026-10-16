# Release 1 Report — Live Postgres in CI

Status: Enterprise Candidate — Active Development

## Scope

R1 applied migrations 001–014 to PostgreSQL 16, wired `DATABASE_URL` and
`SUPERUSER_URL` into CI, and ran all 101 previously skipped integration tests.

## Migration files applied (001–014)

| File | Status |
|------|--------|
| 001_identity_tenancy_rls.sql | Applied |
| 002_sources_fragments.sql | Applied |
| 003_claims_provenance.sql | Applied |
| 004_jobs_agents.sql | Applied |
| 005_m03_architect.sql | Applied |
| 006_human_review.sql | Applied |
| 007_rendered_artifacts.sql | Applied |
| 008_release_labels.sql | Applied |
| 009_export_audit.sql | Applied |
| 010_project_budgets.sql | Applied |
| 011_revocation_events.sql | Applied |
| 012_provenance_ledger.sql | Applied |
| 013_code_to_document_traces.sql | Applied |
| 014_consensus_decision_events.sql | Applied |

## Integration test results

| Suite | Tests | Result |
|-------|-------|--------|
| `src/rls.integration.test.ts` | 14 | Passed |
| `src/sources.integration.test.ts` | 28 | Passed |
| `src/claims.integration.test.ts` | 35 | Passed |
| `src/agents.integration.test.ts` | 24 | Passed |
| **Total** | **101** | **All passed** |

No tests were skipped. No tests were weakened.

## Gate checks

| Check | Exit code |
|-------|-----------|
| `pnpm typecheck` | 0 |
| `pnpm test` | 0 |
| `pnpm lint` | 0 |

## CI changes

- `.github/workflows/ci.yml` — added `postgres:16` service; set `DATABASE_URL`
  and `SUPERUSER_URL` as job-level env vars; added "Initialise database roles"
  step (`scripts/ci-db-init.sql`) and "Apply migrations and seed" step
  (`scripts/ci-migrate.mjs`).
- `scripts/ci-db-init.sql` — creates `app_user` role (idempotent), grants
  `CONNECT` on the database and `USAGE` on the public schema.
- `scripts/ci-migrate.mjs` — forward-only migration runner; applies migrations
  001–014; issues `GRANT ALL ON ALL TABLES / SEQUENCES TO app_user` (covers
  tables from migrations 001–002 which predate the per-migration GRANT pattern);
  loads `packages/db/seed/fixture.sql`.

## Scorecard update

C1 closed. Evidence: 101 integration tests — all passed (see table above).
