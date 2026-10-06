# Phase 10 Plan — Evaluation Evidence and Honest Scorecard

Status: Enterprise Candidate — Active Development

## In-scope items (from DIRECTIV.txt Phase 10)

1. Golden fixtures: happy ADR, contradiction, prompt injection, missing citation,
   unit mismatch, cross-tenant attempt.
2. Test command writes `docs/eval/m03-latest.md` from results. Do not hand-edit passes.
3. Security notes for auth bypass, authz bypass, tenant breach, prompt injection,
   bad upload, XSS, SQL injection: passed only if a test passed; otherwise
   "not covered" or "failed".
4. `docs/runbooks/backup-restore.md` and a local drill script. Do not claim regional
   disaster recovery.
5. `docs/eval/expert-acceptance-protocol.md` with blank scores.
6. `docs/release/scorecard.md`. Any open critical blocker forces FAIL. Do not average
   it away.
7. README claims audit against evidence. Status remains Enterprise Candidate —
   Active Development.
8. Pre-launch blockers stay open unless a recorded test closed them.
9. Gate: full suite. Report counts of passed and failed. Commit only if the suite
   exit code is 0 and the report still lists open limitations honestly. Stop. Do
   not declare production.

## Out of scope

- No new product surface except fixtures and docs.
- No new phase after 10.
- No push.
- No production declaration.

## Commit units (per user instruction — separate commits)

### Commit 1 — Golden suite

- `packages/domain/src/golden-fixtures.ts` — six golden fixture scenarios + eval
  report builder.
- `packages/domain/src/golden.test.ts` — runs all six fixtures, writes
  `docs/eval/m03-latest.md`, asserts all pass.
- `docs/eval/m03-latest.md` — generated eval report (committed as baseline).
- Message: `phase-10: golden suite  -  gate passed`

### Commit 2 — Scorecard

- `docs/release/scorecard.md` — release scorecard with open/closed blockers.
- `docs/runbooks/backup-restore.md` — backup runbook (no regional DR claim).
- `scripts/backup-drill.sh` — local drill script.
- Message: `phase-10: scorecard  -  gate passed`

### Commit 3 — Expert acceptance protocol

- `docs/eval/expert-acceptance-protocol.md` — blank scores.
- `README.md` — claims audit section (update existing README).
- Message: `phase-10: expert acceptance protocol  -  gate passed`

### Commit 4 — Report

- `docs/phases/phase-10-report.md` — gate commands, exit codes, test counts,
  deliverables, requirements matrix, residual risks.
- Message: `phase-10: report  -  gate passed`

## Gate

```bash
cd ~/AlinaMatrix-Enterprise
pnpm typecheck
pnpm test
pnpm lint
```

All three must exit 0 before commit.
