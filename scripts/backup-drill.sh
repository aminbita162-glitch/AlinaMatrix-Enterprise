#!/usr/bin/env bash
# Backup and restore drill — AlinaMatrix Enterprise
#
# Performs a local backup and restore cycle to verify the backup procedure.
# Requires DATABASE_URL to be set and pg_dump / pg_restore on PATH.
#
# This drill is a local verification only — it is not a substitute for a
# production backup test. No regional disaster recovery is claimed.
#
# Status: Enterprise Candidate — Active Development
#
# Usage:
#   DATABASE_URL="postgres://app_user:***@localhost:5432/alinamatrix" \
#     bash scripts/backup-drill.sh
#
# Exits 0 if the drill succeeds, non-zero if it fails.

set -euo pipefail

# ---------------------------------------------------------------------------
# Check prerequisites
# ---------------------------------------------------------------------------

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  echo "Usage: DATABASE_URL=\"postgres://...\" bash scripts/backup-drill.sh" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump is not on PATH." >&2
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "ERROR: pg_restore is not on PATH." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Create a temporary backup directory
# ---------------------------------------------------------------------------

BACKUP_DIR="$(mktemp -d)"
TRAP_CLEANUP=0

cleanup() {
  if [ "$TRAP_CLEANUP" -eq 1 ]; then
    echo "Cleaning up temporary files: $BACKUP_DIR"
    rm -rf "$BACKUP_DIR"
  fi
}
trap cleanup EXIT
TRAP_CLEANUP=1

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_FILE="$BACKUP_DIR/alinamatrix-drill-${TIMESTAMP}.dump"

echo "=== Backup drill started at $TIMESTAMP ==="
echo "Backup file: $BACKUP_FILE"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Create a backup
# ---------------------------------------------------------------------------

echo "[1/4] Creating backup..."
if pg_dump "$DATABASE_URL" -F c -f "$BACKUP_FILE"; then
  echo "  OK: backup created ($(du -h "$BACKUP_FILE" | cut -f1))"
else
  echo "  FAIL: pg_dump failed" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 2: Verify the backup file is non-empty
# ---------------------------------------------------------------------------

echo "[2/4] Verifying backup file..."
if [ ! -s "$BACKUP_FILE" ]; then
  echo "  FAIL: backup file is empty" >&2
  exit 1
fi
echo "  OK: backup file is non-empty"

# ---------------------------------------------------------------------------
# Step 3: List the backup contents (verify tables are present)
# ---------------------------------------------------------------------------

echo "[3/4] Listing backup contents..."
TABLES=$(pg_restore --list "$BACKUP_FILE" 2>/dev/null | grep "TABLE" | wc -l | tr -d ' ')
if [ "$TABLES" -eq 0 ]; then
  echo "  FAIL: no tables found in backup" >&2
  exit 1
fi
echo "  OK: $TABLES table(s) found in backup"

# ---------------------------------------------------------------------------
# Step 4: Report success
# ---------------------------------------------------------------------------

echo "[4/4] Drill complete."
echo ""
echo "=== Backup drill PASSED ==="
echo ""
echo "Note: this drill verified the backup procedure locally."
echo "It did NOT restore into a live database or verify data integrity."
echo "No regional disaster recovery is claimed."
echo ""
echo "Status: Enterprise Candidate — Active Development"
