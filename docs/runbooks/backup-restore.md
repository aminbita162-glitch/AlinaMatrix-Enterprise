# Backup and Restore Runbook — AlinaMatrix Enterprise

Status: Enterprise Candidate — Active Development

> No production claim is made. No regional disaster recovery is claimed.
> This runbook describes the backup and restore procedure verified against a
> live PostgreSQL 16 instance in the R5 backup drill. A production deployment
> requires a separate, tested runbook.

## Scope

This runbook covers:
- Local PostgreSQL database backup (`pg_dump -F c`, custom format)
- Restore from a backup file into a fresh database (`pg_restore`)
- Reading the same tenant row from both the live and restored databases
  and asserting they match
- A drill script (`scripts/backup-drill.sh`) that performs the full
  dump → restore → tenant-read cycle and reports pass or fail

This runbook does **not** cover:
- Regional disaster recovery (not implemented — see open limitations)
- Cross-region replication (not implemented)
- Point-in-time recovery (not implemented)
- Backup encryption at rest (not implemented in this phase)

## Prerequisites

- PostgreSQL 16 (the drill was run against a `postgres:16` Docker container)
- `pg_dump` and `pg_restore` available on PATH
- `DATABASE_URL` environment variable set to the database connection string
- Migrations 001–014 applied (`packages/db/migrations/`)
- The `TENANT_ID` to read must exist in the live database

## Backup procedure

### 1. Create a backup

```bash
# Set the database URL
export DATABASE_URL="postgres://app_user:***@localhost:5432/alinamatrix"

# Create a timestamped backup (custom format)
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
pg_dump "$DATABASE_URL" -F c -f "backups/alinamatrix-${TIMESTAMP}.dump"
```

### 2. Verify the backup

```bash
# List the contents of the backup (tables must be present)
pg_restore --list "backups/alinamatrix-${TIMESTAMP}.dump"
```

## Restore procedure

### 1. Restore from a backup into a fresh database

```bash
# Create a fresh restore database (connect to the postgres maintenance DB)
psql "postgres://app_user:***@localhost:5432/postgres" \
  -c "CREATE DATABASE alinamatrix_restored;"

# Restore the backup into it
pg_restore -d "postgres://app_user:***@localhost:5432/alinamatrix_restored" \
  --no-owner --clean --if-exists "backups/alinamatrix-YYYYMMDDTHHMMSSZ.dump"
```

### 2. Verify the restore — read the same tenant

```bash
# Read the same tenant row from both the live and restored databases
TENANT_ID="aaaaaaaa-0000-4000-a000-000000000001"

LIVE_ROW=$(psql "$DATABASE_URL" -tAc \
  "SELECT id, name, slug, is_fixture FROM tenants WHERE id = '${TENANT_ID}';")

RESTORED_ROW=$(psql "postgres://...@localhost:5432/alinamatrix_restored" -tAc \
  "SELECT id, name, slug, is_fixture FROM tenants WHERE id = '${TENANT_ID}';")

[ "$LIVE_ROW" = "$RESTORED_ROW" ] && echo "match" || echo "MISMATCH"
```

### 3. Clean up

```bash
psql "postgres://...@localhost:5432/postgres" \
  -c "DROP DATABASE alinamatrix_restored;"
```

## R5 backup drill — recorded result

The R5 backup drill was run against a live PostgreSQL 16 instance
(`alinamatrix-enterprise-postgres-1` Docker container, `postgres:16`,
port 5432) with all 14 migrations applied and the fixture seed loaded.

**Command:**

```bash
DATABASE_URL="postgres://alinamatrix:***@localhost:5432/alinamatrix" \
TENANT_ID="aaaaaaaa-0000-4000-a000-000000000001" \
bash scripts/backup-drill.sh
```

**Result: PASSED (exit 0).** The drill:

1. **Dump** — `pg_dump -F c` (custom format) of the live `alinamatrix`
   database. Dump file: 204K, non-empty.
2. **Restore** — created a fresh throwaway database
   `alinamatrix_drill_restore_<pid>` and restored the dump into it with
   `pg_restore --no-owner --clean --if-exists`. 132 table(s) listed in the
   backup; all restored.
3. **Tenant read** — read tenant
   `aaaaaaaa-0000-4000-a000-000000000001` ("Fixture Tenant Alpha") from
   both the live and restored databases and asserted the rows match
   exactly:

   ```
   live:     aaaaaaaa-0000-4000-a000-000000000001|Fixture Tenant Alpha|fixture-alpha|true
   restored: aaaaaaaa-0000-4000-a000-000000000001|Fixture Tenant Alpha|fixture-alpha|true
   ```
4. **Cleanup** — dropped the throwaway restore database. No restore
   databases left behind (verified: `SELECT datname FROM pg_database WHERE
   datname LIKE '%drill_restore%'` returned 0 rows).

**Environment:** PostgreSQL 16.15 (Debian 16.15-1.pgdg13+2) in the
`alinamatrix-enterprise-postgres-1` Docker container. The host machine has
no `pg_dump` / `psql` on PATH, so the script was copied into the container
and run there with `DATABASE_URL` pointing at `localhost:5432`.

**Recorded output (verbatim, drill run 20261017T022319Z):**

```
=== Backup drill started at 20261017T022319Z ===
Live database:   alinamatrix
Restore database: alinamatrix_drill_restore_22318
Tenant id:        aaaaaaaa-0000-4000-a000-000000000001
Backup file:      /tmp/tmp.xN0KMS83Wi/alinamatrix-drill-20261017T022319Z.dump

[1/5] Dumping live database...
  OK: dump created (204K)
[2/5] Verifying backup file...
  OK: backup non-empty, 132 table(s) listed
[3/5] Creating restore database and restoring...
  OK: restored into alinamatrix_drill_restore_22318
[4/5] Reading tenant aaaaaaaa-0000-4000-a000-000000000001 from live and restored...
  OK: live and restored tenant rows match
  live:     aaaaaaaa-0000-4000-a000-000000000001|Fixture Tenant Alpha|fixture-alpha|true
  restored: aaaaaaaa-0000-4000-a000-000000000001|Fixture Tenant Alpha|fixture-alpha|true
[5/5] Dropping restore database...
  OK: alinamatrix_drill_restore_22318 dropped

=== Backup drill PASSED ===

Dump:      pg_dump -F c (custom format, 132 table(s))
Restore:   pg_restore --no-owner --clean --if-exists into alinamatrix_drill_restore_22318 (dropped)
Tenant read: aaaaaaaa-0000-4000-a000-000000000001 matched between live and restored

Note: this drill dumped, restored, and read the same tenant against a
live PostgreSQL instance. It did NOT test point-in-time recovery,
cross-region replication, or encrypted-at-rest backups.
No regional disaster recovery is claimed.

Status: Enterprise Candidate — Active Development
```

## Drill script

The drill script (`scripts/backup-drill.sh`) performs the full dump →
restore → tenant-read cycle against a live PostgreSQL instance. It
requires `DATABASE_URL` to be set and `pg_dump` / `pg_restore` / `psql`
available on PATH.

```bash
# Run the drill
DATABASE_URL="postgres://app_user:***@localhost:5432/alinamatrix" \
TENANT_ID="aaaaaaaa-0000-4000-a000-000000000001" \
bash scripts/backup-drill.sh
```

The script exits 0 if the drill succeeds and non-zero if it fails. The
drill is not a substitute for a production backup test — it is a local
verification of the dump, restore, and tenant-read procedure against a
live PostgreSQL instance.

## Backup schedule (local development)

Backups are not automated in this phase. For local development:
- Create a backup before running migrations
- Create a backup before destructive testing
- The drill script can be run on demand to verify the procedure

## Open limitations

1. **No automated backup schedule.** Backups are manual. A production
   deployment requires automated, monitored, and tested backups.
2. **No regional disaster recovery.** No DR site, no cross-region
   replication. A production deployment requires a tested DR plan. The R5
   drill did not test regional disaster recovery.
3. **No backup encryption.** Backup files are not encrypted at rest.
   A production deployment requires encrypted backups.
4. **No point-in-time recovery.** Only full backups are supported.
5. **Single-instance drill.** The R5 drill ran against a single
   PostgreSQL 16 Docker container on one host. It did not test restore
   onto a different host, a different PostgreSQL major version, or a
   managed Postgres offering.

No production claim is made.
