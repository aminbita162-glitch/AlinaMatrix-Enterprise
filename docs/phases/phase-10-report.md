# Phase 10 Report — Evaluation Evidence and Honest Scorecard

Status: Enterprise Candidate — Active Development

## Gate commands and exit codes

| Command          | Exit code | Notes                                                  |
|------------------|-----------|--------------------------------------------------------|
| `pnpm typecheck` | 0         | All 6 packages clean (apps/web, apps/api, packages/*) |
| `pnpm test`      | 0         | 688 passed, 0 failed, 101 skipped (no live DB in gate) |
| `pnpm lint`      | 0         | `npx eslint . --max-warnings 0` — 0 errors, 0 warnings  |

Note: `pnpm -r lint` fails because `apps/web` has a `next lint` script that
prompts interactively (no `.eslintrc` in `apps/web`). The root `pnpm lint`
script (`eslint . --max-warnings 0`) uses the flat config at
`eslint.config.cjs` and passes with exit 0. The gate uses the root script.

## Test counts (gate run — no live DB)

| Package          | Test file                          | Passed | Failed | Skipped |
|------------------|------------------------------------|--------|--------|---------|
| packages/domain  | workflow.test.ts                   | 12     | 0      | 0       |
| packages/domain  | agents.test.ts                     | 51     | 0      | 0       |
| packages/domain  | claims.test.ts                     | 35     | 0      | 0       |
| packages/domain  | architect.test.ts                  | 22     | 0      | 0       |
| packages/domain  | generate.test.ts                   | 25     | 0      | 0       |
| packages/domain  | guard.test.ts                      | 37     | 0      | 0       |
| packages/domain  | review.test.ts                     | 28     | 0      | 0       |
| packages/domain  | release.test.ts (Phase 9)          | 29     | 0      | 0       |
| packages/domain  | export.test.ts (Phase 9)           | 13     | 0      | 0       |
| packages/domain  | budget.test.ts (Phase 9)           | 12     | 0      | 0       |
| packages/domain  | revocation.test.ts (Phase 9)       | 8      | 0      | 0       |
| packages/domain  | golden.test.ts (Phase 10)          | 9      | 0      | 0       |
| packages/renderer| html.test.ts                       | 13     | 0      | 0       |
| packages/renderer| manifest.test.ts                   | 14     | 0      | 0       |
| packages/renderer| pdf.test.ts                        | 5      | 0      | 0       |
| packages/renderer| watermark.test.ts                  | 8      | 0      | 0       |
| packages/renderer| replay.test.ts (Phase 8)          | 17     | 0      | 0       |
| packages/db      | sources.test.ts                    | 19     | 0      | 0       |
| packages/db      | claims.test.ts                     | 28     | 0      | 0       |
| packages/db      | review.test.ts                     | 36     | 0      | 0       |
| packages/db      | render.test.ts (Phase 8)          | 27     | 0      | 0       |
| packages/db      | release.test.ts (Phase 9)         | 22     | 0      | 0       |
| packages/db      | m03.test.ts                        | 22     | 0      | 0       |
| packages/db      | agents.test.ts                     | 38     | 0      | 0       |
| packages/db      | rls.test.ts                        | 8      | 0      | 0       |
| packages/db      | audit.test.ts                      | 5      | 0      | 0       |
| packages/db      | injection.test.ts                  | 10     | 0      | 0       |
| packages/db      | export-audit.test.ts (Phase 9)    | 14     | 0      | 0       |
| packages/db      | budget.test.ts (Phase 9)          | 20     | 0      | 0       |
| packages/db      | revocation.test.ts (Phase 9)      | 17     | 0      | 0       |
| packages/db      | agents.integration.test.ts         | 0      | 0      | 24      |
| packages/db      | sources.integration.test.ts        | 0      | 0      | 28      |
| packages/db      | claims.integration.test.ts         | 0      | 0      | 35      |
| packages/db      | rls.integration.test.ts            | 0      | 0      | 14      |
| apps/api         | logger.test.ts                     | 5      | 0      | 0       |
| apps/api         | storage.test.ts                    | 11     | 0      | 0       |
| apps/api         | ingest.test.ts                     | 15     | 0      | 0       |
| apps/api         | router.test.ts                     | 2      | 0      | 0       |
| apps/api         | review.test.ts                     | 29     | 0      | 0       |
| apps/api         | auth.test.ts                       | 22     | 0      | 0       |
| **Total**        |                                    | **688**| **0**  | **101** |

Integration tests are skipped without `DATABASE_URL`. They require migrations
001–011 applied.

To run with live DB:
```
DATABASE_URL=postgres://app_user:***@localhost:5432/alinamatrix \
SUPERUSER_URL=postgres://alinamatrix:***@localhost:5432/alinamatrix \
  pnpm test
```

## Deliverables committed (3 separate commits + this report)

### Commit 1 — `phase-10: golden suite  -  gate passed` (0b82410)
- `packages/domain/src/golden-fixtures.ts`
  - Six golden fixture scenarios:
    1. **happy-adr** — a clean ADR passes the guard (hardPassed + softPassed
       → APPROVED).
    2. **contradiction** — a flagged claim forces NEEDS_REVIEW.
    3. **prompt-injection** — injected source text does not change the plan;
       output does not contain "RELEASED" or the injection string.
    4. **missing-citation** — a referenced claim id that does not exist is
       rejected (UnknownClaimError).
    5. **unit-mismatch** — two claims with the same subject but different
       units produce a UnitMismatchFlag (no auto-correct).
    6. **cross-tenant** — a tenant-B cache key differs from a tenant-A key
       (cross-tenant cache miss).
  - `buildEvalReport(results)` — assembles a markdown report from results;
    does not hand-edit any pass/fail status.
- `packages/domain/src/golden.test.ts` — 9 tests: runs all six fixtures,
  writes `docs/eval/m03-latest.md` from results, asserts all pass, verifies
  the report records passed and failed counts honestly.
- `docs/eval/m03-latest.md` — generated eval report (committed as baseline).
- `docs/phases/phase-10-plan.md` — phase plan.

### Commit 2 — `phase-10: scorecard  -  gate passed` (91a6237)
- `docs/release/scorecard.md`
  - Release scorecard with overall verdict: **FAIL — not production-ready.**
  - 5 open critical blockers (integration tests, PDF, no live LLM, security
    coverage is unit-level, no regional DR).
  - Security coverage table: auth bypass, authz bypass, tenant breach,
    prompt injection, bad upload, XSS, SQL injection — each marked
    "Passed" with evidence from the test file that covers it.
  - Release gate, budget breaker, revocation, export, golden fixtures
    tables — each check marked Passed with evidence.
  - 5 pre-launch blockers that must be closed before production.
- `docs/runbooks/backup-restore.md`
  - Backup and restore runbook. Covers local pg_dump, restore, drill script.
  - Explicitly does **not** claim regional disaster recovery.
  - 5 open limitations (no automated schedule, no DR, no encryption, no
    PITR, drill not run against live DB).
- `scripts/backup-drill.sh`
  - Local drill script. Creates a backup, verifies it is non-empty, lists
    tables, reports success. Requires `DATABASE_URL` and `pg_dump` /
    `pg_restore` on PATH. Exits 0 on success, non-zero on failure.

### Commit 3 — `phase-10: expert acceptance protocol  -  gate passed` (7852805)
- `docs/eval/expert-acceptance-protocol.md`
  - Expert acceptance protocol with **blank scores** (all `__`).
  9 evaluation sections: M03 pipeline, release gate, budget breaker,
  revocation, export, renderer, security, backup/restore, honesty.
  - Scoring scale 0–5 with explicit meanings.
  - Overall verdict block (reviewer name, role, date, score, verdict,
    critical blockers, conditions) — all blank.
  - "Any open critical blocker forces FAIL. Do not average it away."
  - 6 open limitations declared honestly per H05.
- `README.md`
  - Phases table updated: all 10 phases marked "Complete".
  - Known Limitations section rewritten with current Phase 10 status:
    integration tests skipped, PDF not built, no live LLM, security
    coverage is unit-level, no regional DR.
  - Claims Audit section added: 12 claims audited against evidence in
    the repository (status line, product sentence, four agents, no live
    LLM, no production claim, PDF not built, integration tests skipped,
    M03 only, no invented citations, backup drill, scorecard, protocol).

## Requirements matrix (Directive Phase 10)

| Directive requirement                                          | Delivered | Evidence                                              |
|----------------------------------------------------------------|-----------|-------------------------------------------------------|
| Golden fixtures: happy ADR, contradiction, prompt injection,   | Yes       | golden-fixtures.ts — six fixtures; golden.test.ts     |
| missing citation, unit mismatch, cross-tenant attempt           |           | 9 tests, all pass                                    |
| Test command writes docs/eval/m03-latest.md from results       | Yes       | golden.test.ts — writeFileSync in the test            |
| Do not hand-edit passes                                         | Yes       | buildEvalReport uses r.passed booleans, no literals   |
| Security notes: auth bypass, authz bypass, tenant breach,      | Yes       | docs/release/scorecard.md — Security coverage table   |
| prompt injection, bad upload, XSS, SQL injection               |           | with Passed status + evidence per item                |
| "passed only if a test passed; otherwise not covered or failed"| Yes       | Each security item cites the test file; no item is    |
|                                                                |           | marked passed without a test                          |
| docs/runbooks/backup-restore.md                                | Yes       | docs/runbooks/backup-restore.md                       |
| Local drill script                                             | Yes       | scripts/backup-drill.sh                              |
| Do not claim regional disaster recovery                        | Yes       | "No regional disaster recovery is claimed" in runbook|
| docs/eval/expert-acceptance-protocol.md with blank scores      | Yes       | docs/eval/expert-acceptance-protocol.md — all `__`    |
| docs/release/scorecard.md                                      | Yes       | docs/release/scorecard.md                             |
| Any open critical blocker forces FAIL                          | Yes       | scorecard verdict: "FAIL — not production-ready"     |
| Do not average it away                                         | Yes       | 5 critical blockers listed; overall verdict FAIL      |
| README claims audit against evidence                           | Yes       | README.md — Claims Audit section (12 claims)         |
| Status remains Enterprise Candidate — Active Development       | Yes       | All docs, README, reports carry the exact status line |
| Pre-launch blockers stay open unless a recorded test closed them| Yes      | 5 pre-launch blockers in scorecard; all open           |
| Gate: full suite                                               | Yes       | pnpm typecheck (0), pnpm test (0), pnpm lint (0)      |
| Report counts of passed and failed                             | Yes       | 688 passed, 0 failed, 101 skipped                     |
| Commit only if suite exit code is 0 and report lists open      | Yes       | Gate passed; report lists open limitations           |
| limitations honestly                                           |           |                                                       |
| Stop. Do not declare production                                | Yes       | No "production-ready" claim anywhere; verdict FAIL   |
| Do not add a phase after 10                                     | Yes       | No Phase 11 started; no Phase 11 plan                 |
| Do not push                                                     | Yes       | No push performed                                     |
| PDF not built and skipped live tests as open limitations       | Yes       | Scorecard C2 (PDF); C1 (integration tests); README    |

## Open limitations (declared honestly per H05)

1. **Integration tests skipped.** The 101 skipped integration tests require
   a live PostgreSQL instance with migrations 001–011 applied and
   `DATABASE_URL`/`SUPERUSER_URL` set. They are not failed — they are
   skipped without a live database. The DB layer for all tables is tested
   with a mock client only; the immutability triggers, RLS policies, and
   CHECK constraints are verified structurally (the migration SQL contains
   the right clauses) but not executed against a real database.

2. **PDF not built.** No local pinned offline PDF renderer is available in
   the workspace. `renderPdf()` returns `status: "not_built"` with a visible
   English reason and no fake bytes.

3. **No live LLM.** All agent outputs use DeterministicFakeProvider (R07).
   No real model call has been made. Determinism is structural (same inputs
   → same hash), not semantic (the output is not verified against a real
   model).

4. **Security coverage is unit-level only.** Auth bypass, authz bypass,
   tenant breach, prompt injection, bad upload, XSS, and SQL injection are
   covered by unit tests with mock doubles — not by live integration tests
   against a real database. Penetration testing has not been performed.

5. **No regional disaster recovery.** No DR site, no cross-region replication.
   The backup runbook and drill script are local procedures only. The drill
   script has not been run against a live database.

6. **`pnpm -r lint` interactive prompt.** The `apps/web` package has a
   `next lint` script that prompts interactively (no `.eslintrc` in
   `apps/web`). The root `pnpm lint` script (`eslint . --max-warnings 0`)
   uses the flat config and passes with exit 0. The gate uses the root
   script, not `pnpm -r lint`.

## Residual risks

1. **Integration tests not exercised.** The DB layers for all tables are
   tested with a mock client only. The immutability triggers, RLS policies,
   and CHECK constraints have not been verified against a live PostgreSQL
   instance. The SQL structural tests confirm the migrations *contain* the
   right clauses, but execution against a real database is deferred to a
   live CI run with `DATABASE_URL`.

2. **Budget check is caller-responsibility.** `checkBudget` and
   `BudgetBreaker` enforce the hard stop at the domain layer, but the DB
   layer (`increaseProjectBudgetSpent`) does not enforce the budget
   server-side — it simply accrues spent amounts. A caller that bypasses
   the BudgetBreaker could exceed the budget at the DB level.

3. **Revocation does not set the release label to REVOKED.** The domain
   `revokeRelease` function builds the event record only. The caller is
   responsible for both inserting the event (append-only) and calling
   `updateReleaseLabel(client, artifactId, "REVOKED")` to transition the
   label. A caller that inserts the event without transitioning the label
   would leave the artifact in a PUBLISHED state with a revocation event.

4. **Export watermark check is string-based.** `isWatermarkIntact` checks
   that all four watermark field values are substrings of the HTML. It
   does not parse the HTML DOM to verify they are in `<meta>` tags. A
   false positive is possible if a watermark value appears coincidentally
   in the rendered content.

5. **Expert acceptance protocol is blank.** The protocol exists with blank
   scores. No expert reviewer has filled it in. The scorecard verdict is
   based on the automated test suite only — not on expert review.

## Commit log (Phase 10)

```
0b82410 phase-10: golden suite  -  gate passed
91a6237 phase-10: scorecard  -  gate passed
7852805 phase-10: expert acceptance protocol  -  gate passed
```

Phase 10 is complete. Stopping. Phase 11 has not been started and will not
be started — the directive defines Phases 1–10 only. No production
declaration is made. Status: Enterprise Candidate — Active Development.
