# Release 5 — Backup Drill

Status: Enterprise Candidate — Active Development

## In scope (from DIRECTIV.txt, R5)

> Run `scripts/backup-drill.sh` against the live database. Dump, restore,
> read the same tenant. Record the result in `docs/runbooks/backup-restore.md`.
> Do not claim regional disaster recovery. Gate exit 0. Stop.

## What changed

- **`scripts/backup-drill.sh`** — rewritten from a dump-only stub into a
  full dump → restore → tenant-read drill against a live PostgreSQL
  instance:
  1. `pg_dump -F c` (custom format) of the live database.
  2. Verify the dump is non-empty and lists tables.
  3. Create a fresh throwaway database and `pg_restore --no-owner --clean
     --if-exists` the dump into it.
  4. Read the same tenant row (`TENANT_ID`, default
     `aaaaaaaa-0000-4000-a000-000000000001`) from both the live and
     restored databases and assert the rows match exactly.
  5. Drop the throwaway restore database. No restore databases left behind.
  The script uses `psql` against a maintenance URL (the `postgres` DB) for
  CREATE/DROP DATABASE, since `createdb`/`dropdb` do not honor a connection
  URI's user when the OS user differs. Exits 0 on success, non-zero on
  failure. Requires `DATABASE_URL` and `pg_dump`/`pg_restore`/`psql` on PATH.

- **`docs/runbooks/backup-restore.md`** — updated to record the real R5
  drill result: the command, the environment, the verbatim output, and the
  open limitations (single-instance drill, no regional DR, no PITR, no
  encryption at rest).

- **`docs/release/scorecard.md`** — C5 (No regional disaster recovery)
  updated to record that the backup drill passed against a live PostgreSQL
  16 Docker container while regional DR remains out of scope. Pre-launch
  blocker #3 ("Set up backup and restore drill") closed (R5).

## Drill result

**PASSED (exit 0)** against a live PostgreSQL 16.15 Docker container
(`alinamatrix-enterprise-postgres-1`, `postgres:16`, port 5432) with all
14 migrations applied and the fixture seed loaded.

- Dump: `pg_dump -F c`, 204K, 132 table(s) listed.
- Restore: `pg_restore --no-owner --clean --if-exists` into
  `alinamatrix_drill_restore_22318` (fresh throwaway DB).
- Tenant read: `aaaaaaaa-0000-4000-a000-000000000001` ("Fixture Tenant
  Alpha") — live and restored rows matched exactly:
  `aaaaaaaa-0000-4000-a000-000000000001|Fixture Tenant Alpha|fixture-alpha|true`
- Cleanup: throwaway DB dropped; 0 leftover `drill_restore` databases.

Full verbatim output is in `docs/runbooks/backup-restore.md`.

## What was not done

- No regional disaster recovery is claimed. No DR site, no cross-region
  replication, no point-in-time recovery, no backup encryption at rest.
- The drill ran against a single PostgreSQL 16 Docker container on one
  host. It did not test restore onto a different host, a different
  PostgreSQL major version, or a managed Postgres offering.

## Gate

| Command | Exit |
|---------|------|
| `pnpm typecheck` | 0 |
| `pnpm test` | 0 (323 passed, 101 skipped — integration tests without `DATABASE_URL`/`SUPERUSER_URL` in this env) |
| `pnpm lint` | 0 |

All three exit 0. Gate passed.

## Commits

1. `release-5: backup drill (dump, restore, tenant read) - gate passed`
   — `scripts/backup-drill.sh` + `docs/runbooks/backup-restore.md`
2. `release-5: scorecard C5 + report - gate passed`
   — `docs/release/scorecard.md` + `docs/phases/release-5-report.md`

Not pushed. R6 not started.
