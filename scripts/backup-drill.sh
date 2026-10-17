#!/usr/bin/env bash
# Backup and restore drill — AlinaMatrix Enterprise
#
# Performs a real backup + restore + tenant read against a live PostgreSQL
# database. Requires DATABASE_URL to be set. The drill:
#   1. Dumps the live database (pg_dump -F c).
#   2. Restores the dump into a fresh throwaway database (pg_restore).
#   3. Reads the same tenant row from both the live and restored databases
#      and asserts the restored row matches the live row exactly.
#   4. Drops the throwaway database and cleans up the backup file.
#
# This drill is a local verification only — it is not a substitute for a
# production backup test. No regional disaster recovery is claimed.
#
# Status: Enterprise Candidate — Active Development
#
# Usage (host pg client binaries on PATH):
#   DATABASE_URL="postgres://app_user:***@localhost:5432/alinamatrix" \
#     TENANT_ID="aaaaaaaa-0000-4000-a000-000000000001" \
#     bash scripts/backup-drill.sh
#
# Usage (no host pg binaries — run inside the container):
#   docker exec -e DATABASE_URL="postgres://alinamatrix:***@localhost:5432/alinamatrix" \
#     -e TENANT_ID="aaaaaaaa-0000-4000-a000-000000000001" \
#     alinamatrix-enterprise-postgres-1 bash scripts/backup-drill.sh
#
# Exits 0 if the drill succeeds, non-zero if it fails.

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATABASE_URL="${DATABASE_URL:-}"
TENANT_ID="${TENANT_ID:-aaaaaaaa-0000-4000-a000-000000000001}"
RESTORE_DB_SUFFIX="_drill_restore_$$"

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  echo "Usage: DATABASE_URL=\"postgres://...\" bash scripts/backup-drill.sh" >&2
  exit 1
fi

for bin in pg_dump pg_restore psql; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "ERROR: $bin is not on PATH." >&2
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Cleanup helpers
# ---------------------------------------------------------------------------

BACKUP_DIR="$(mktemp -d)"
TRAP_CLEANUP=0
RESTORE_DB=""

cleanup() {
  local rc=$?
  if [ "$TRAP_CLEANUP" -eq 1 ]; then
    if [ -n "$RESTORE_DB" ]; then
      echo "Dropping restore database: $RESTORE_DB"
      psql "$MAINT_URL" -v ON_ERROR_STOP=1 \
        -c "DROP DATABASE IF EXISTS \"${RESTORE_DB}\";" >/dev/null 2>&1 || true
    fi
    rm -rf "$BACKUP_DIR"
  fi
  exit $rc
}
trap cleanup EXIT
TRAP_CLEANUP=1

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_FILE="$BACKUP_DIR/alinamatrix-drill-${TIMESTAMP}.dump"

# Derive the restore target database name from the live DATABASE_URL's
# dbname, then append a unique suffix so multiple drills never collide.
LIVE_DBNAME=$(psql "$DATABASE_URL" -tAc "SELECT current_database();")
if [ -z "$LIVE_DBNAME" ]; then
  echo "FAIL: could not resolve live database name from DATABASE_URL" >&2
  exit 1
fi
RESTORE_DB="${LIVE_DBNAME}${RESTORE_DB_SUFFIX}"

# A maintenance connection URL to the "postgres" database, used for
# CREATE/DROP DATABASE (cannot run inside a session connected to the
# target database itself). Swap the live dbname for "postgres" at the
# end of the path component, preserving any ?query string.
if [[ "$DATABASE_URL" =~ ^(.*/)${LIVE_DBNAME}(\?.*)?$ ]]; then
  MAINT_URL="${BASH_REMATCH[1]}postgres${BASH_REMATCH[2]:-}"
else
  MAINT_URL="${DATABASE_URL%/}/postgres"
fi

echo "=== Backup drill started at $TIMESTAMP ==="
echo "Live database:   $LIVE_DBNAME"
echo "Restore database: $RESTORE_DB"
echo "Tenant id:        $TENANT_ID"
echo "Backup file:      $BACKUP_FILE"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Dump the live database
# ---------------------------------------------------------------------------

echo "[1/5] Dumping live database..."
if pg_dump "$DATABASE_URL" -F c -f "$BACKUP_FILE"; then
  echo "  OK: dump created ($(du -h "$BACKUP_FILE" | cut -f1))"
else
  echo "  FAIL: pg_dump failed" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 2: Verify the dump is non-empty and lists tables
# ---------------------------------------------------------------------------

echo "[2/5] Verifying backup file..."
if [ ! -s "$BACKUP_FILE" ]; then
  echo "  FAIL: backup file is empty" >&2
  exit 1
fi
TABLES=$(pg_restore --list "$BACKUP_FILE" 2>/dev/null | grep -c "TABLE " || true)
if [ "$TABLES" -eq 0 ]; then
  echo "  FAIL: no tables found in backup" >&2
  exit 1
fi
echo "  OK: backup non-empty, $TABLES table(s) listed"

# ---------------------------------------------------------------------------
# Step 3: Restore into a fresh throwaway database
# ---------------------------------------------------------------------------

echo "[3/5] Creating restore database and restoring..."
# Connect to the maintenance "postgres" database to issue CREATE DATABASE.
# psql $MAINT_URL already targets the postgres maintenance database.
if ! psql "$MAINT_URL" -v ON_ERROR_STOP=1 \
       -c "CREATE DATABASE \"${RESTORE_DB}\";" >/dev/null 2>&1; then
  echo "  FAIL: could not create restore database $RESTORE_DB" >&2
  exit 1
fi

# Build a restore DATABASE_URL by swapping the dbname at the end of the
# path component, preserving any ?query string.
if [[ "$DATABASE_URL" =~ ^(.*/)${LIVE_DBNAME}(\?.*)?$ ]]; then
  RESTORE_URL="${BASH_REMATCH[1]}${RESTORE_DB}${BASH_REMATCH[2]:-}"
else
  RESTORE_URL="${DATABASE_URL%/}/${RESTORE_DB}"
fi

if pg_restore -d "$RESTORE_URL" --no-owner --clean --if-exists "$BACKUP_FILE" 2>"$BACKUP_DIR/restore.log"; then
  echo "  OK: restored into $RESTORE_DB"
else
  rc=$?
  echo "  FAIL: pg_restore exited $rc" >&2
  echo "  --- restore log (tail) ---" >&2
  tail -20 "$BACKUP_DIR/restore.log" >&2 || true
  exit "$rc"
fi

# ---------------------------------------------------------------------------
# Step 4: Read the same tenant from both live and restored databases
# ---------------------------------------------------------------------------

echo "[4/5] Reading tenant $TENANT_ID from live and restored..."
LIVE_ROW=$(psql "$DATABASE_URL" -tAc \
  "SELECT id || '|' || COALESCE(name,'') || '|' || COALESCE(slug,'') || '|' || COALESCE(is_fixture::text,'') FROM tenants WHERE id = '${TENANT_ID}';")
RESTORED_ROW=$(psql "$RESTORE_URL" -tAc \
  "SELECT id || '|' || COALESCE(name,'') || '|' || COALESCE(slug,'') || '|' || COALESCE(is_fixture::text,'') FROM tenants WHERE id = '${TENANT_ID}';")

if [ -z "$LIVE_ROW" ]; then
  echo "  FAIL: tenant $TENANT_ID not found in live database" >&2
  exit 1
fi
if [ -z "$RESTORED_ROW" ]; then
  echo "  FAIL: tenant $TENANT_ID not found in restored database" >&2
  exit 1
fi
if [ "$LIVE_ROW" != "$RESTORED_ROW" ]; then
  echo "  FAIL: tenant row mismatch" >&2
  echo "  live:     $LIVE_ROW" >&2
  echo "  restored: $RESTORED_ROW" >&2
  exit 1
fi
echo "  OK: live and restored tenant rows match"
echo "  live:     $LIVE_ROW"
echo "  restored: $RESTORED_ROW"

# ---------------------------------------------------------------------------
# Step 5: Drop the restore database and report
# ---------------------------------------------------------------------------

echo "[5/5] Dropping restore database..."
RESTORE_DB_NAME="$RESTORE_DB"
if psql "$MAINT_URL" -v ON_ERROR_STOP=1 \
   -c "DROP DATABASE IF EXISTS \"${RESTORE_DB}\";" >/dev/null 2>&1; then
  echo "  OK: $RESTORE_DB dropped"
else
  echo "  WARN: DROP DATABASE failed for $RESTORE_DB (left for inspection)" >&2
fi
RESTORE_DB=""

echo ""
echo "=== Backup drill PASSED ==="
echo ""
echo "Dump:      pg_dump -F c (custom format, $TABLES table(s))"
echo "Restore:   pg_restore --no-owner --clean --if-exists into ${RESTORE_DB_NAME} (dropped)"
echo "Tenant read: $TENANT_ID matched between live and restored"
echo ""
echo "Note: this drill dumped, restored, and read the same tenant against a"
echo "live PostgreSQL instance. It did NOT test point-in-time recovery,"
echo "cross-region replication, or encrypted-at-rest backups."
echo "No regional disaster recovery is claimed."
echo ""
echo "Status: Enterprise Candidate — Active Development"
