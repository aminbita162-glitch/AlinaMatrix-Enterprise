#!/usr/bin/env bash
# 30-second English demo — AlinaMatrix Enterprise
#
# Runs the golden suite and prints the status line plus open limitations.
# No live LLM. No production claim. DeterministicFakeProvider only.
#
# Directive Phase A:
#   "Root 30-second English demo runs the golden suite and prints the status
#   line plus open limitations."
#
# Usage: bash scripts/demo.sh
#
# Status: Enterprise Candidate — Active Development

set -euo pipefail

echo "============================================================"
echo "AlinaMatrix Enterprise — 30-Second Demo"
echo "============================================================"
echo ""
echo "Status: Enterprise Candidate — Active Development"
echo ""
echo "--- Running golden suite (packages/domain) ---"
echo ""

# Run the domain test suite (which includes the golden fixtures)
pnpm --filter @alinamatrix/domain test 2>&1 | tail -5

echo ""
echo "--- Golden suite complete ---"
echo ""
echo "Open limitations:"
echo "  - Beachhead (M03) not yet proven — end-to-end requires live PostgreSQL"
echo "  - 101 integration tests skipped (require DATABASE_URL + SUPERUSER_URL)"
echo "  - No PDF output — renderPdf() returns status: not_built"
echo "  - No live LLM — DeterministicFakeProvider only (R07)"
echo "  - Security coverage is unit-level, not live integration"
echo ""
echo "Product sentence: Turn complex evidence into auditable professional artifacts."
echo ""
echo "============================================================"
echo "Enterprise Candidate — Active Development"
echo "============================================================"
