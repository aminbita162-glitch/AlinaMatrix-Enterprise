# Backup and Restore Runbook — AlinaMatrix Enterprise

Status: Enterprise Candidate — Active Development

> No production claim is made. No regional disaster recovery is claimed.
> This runbook describes the local backup and restore procedure for the
> development database. A production deployment requires a separate,
> tested runbook.

## Scope

This runbook covers:
- Local PostgreSQL database backup (pg_dump)
- Local restore from a backup file
- A local drill script (`scripts/backup-drill.sh`) to verify the backup
  procedure

This runbook does **not** cover:
- Regional disaster recovery (not implemented — see open limitations)
- Cross-region replication (not implemented)
- Point-in-time recovery (not implemented)
- Backup encryption at rest (not implemented in this phase)

## Prerequisites

- PostgreSQL 16 installed locally
- `pg_dump` and `pg_restore` available on PATH
- `DATABASE_URL` environment variable set to the database connection string
- Migrations 001–011 applied (`packages/db/migrations/`)

## Backup procedure

### 1. Create a backup

```bash
# Set the database URL
export DATABASE_URL="postgres://app_user:***@localhost:5432/alinamatrix"

# Create a timestamped backup
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
pg_dump "$DATABASE_URL" -F c -f "backups/alinamatrix-${TIMESTAMP}.dump"
```

### 2. Verify the backup

```bash
# List the contents of the backup
pg_restore --list "backups/alinamatrix-${TIMESTAMP}.dump"
```

### 3. Run the drill script

```bash
bash scripts/backup-drill.sh
```

The drill script:
1. Creates a backup of the current database
2. Restores it into a temporary database
3. Verifies the restored database has the expected tables
4. Drops the temporary database

## Restore procedure

### 1. Restore from a backup

```bash
# Create a fresh database (or drop and recreate)
createdb alinamatrix_restored

# Restore the backup
pg_restore -d "postgres://app_user:***@localhost:5432/alinamatrix_restored" \
  "backups/alinamatrix-YYYYMMDDTHHMMSSZ.dump"
```

### 2. Verify the restore

```bash
# Check that all tables are present
psql "$DATABASE_URL" -c "\dt"
```

Expected tables (after migrations 001–011):
- tenants, users, memberships, roles, projects, audit_events
- sources, source_versions, source_fragments, evidence_items
- claims, citations, assumptions, terminology_entries
- agents, agent_versions, model_versions, prompt_versions,
  schema_versions, policy_versions, workflows, workflow_runs,
  processing_jobs, job_events, agent_runs, usage_events, cache_entries
- review_tasks, approvals, comments
- rendered_artifacts
- release_labels
- export_audit
- project_budgets
- revocation_events

## Backup schedule (local development)

Backups are not automated in this phase. For local development:
- Create a backup before running migrations
- Create a backup before destructive testing
- The drill script can be run on demand to verify the procedure

## Open limitations

1. **No automated backup schedule.** Backups are manual. A production
   deployment requires automated, monitored, and tested backups.
2. **No regional disaster recovery.** No DR site, no cross-region
   replication. A production deployment requires a tested DR plan.
3. **No backup encryption.** Backup files are not encrypted at rest.
   A production deployment requires encrypted backups.
4. **No point-in-time recovery.** Only full backups are supported.
5. **Drill script not run against a live database.** `scripts/backup-drill.sh`
   has not been executed against a live PostgreSQL instance in this phase.
   It is a procedure that must be tested before production.

## Drill script

The drill script (`scripts/backup-drill.sh`) performs a local backup and
restore cycle. It requires `DATABASE_URL` to be set and `pg_dump` /
`pg_restore` to be available.

```bash
# Run the drill
DATABASE_URL="postgres://app_user:***@localhost:5432/alinamatrix" \
  bash scripts/backup-drill.sh
```

The script exits 0 if the drill succeeds and non-zero if it fails. The
drill is not a substitute for a production backup test — it is a local
verification of the procedure.

No production claim is made.
