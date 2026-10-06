# Phase 9 Report — Release Gate, Export, Budget, Revocation

Status: Enterprise Candidate — Active Development

## Gate commands and exit codes

| Command          | Exit code | Notes                                                  |
|------------------|-----------|--------------------------------------------------------|
| `pnpm typecheck` | 0         | All 6 packages clean (apps/web, apps/api, packages/*) |
| `pnpm test`      | 0         | 679 passed, 0 failed, 101 skipped (no live DB in gate) |
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
| packages/domain  | export.test.ts (Phase 9)          | 13     | 0      | 0       |
| packages/domain  | budget.test.ts (Phase 9)          | 12     | 0      | 0       |
| packages/domain  | revocation.test.ts (Phase 9)      | 8      | 0      | 0       |
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
| **Total**        |                                    | **679**| **0**  | **101** |

Integration tests are skipped without `DATABASE_URL`. They require migrations
001–011 applied.

To run with live DB:
```
DATABASE_URL=postgres://app_user:***@localhost:5432/alinamatrix \
SUPERUSER_URL=postgres://alinamatrix:***@localhost:5432/alinamatrix \
  pnpm test
```

## Deliverables committed (6 separate commits + this report)

### Commit 1 — `phase-9: release gate  -  gate passed` (b6b74d1)
- `packages/contracts/src/release.ts`
  - `ReleaseLabelSchema` — z.enum of the six labels: DRAFT, INTERNAL_REVIEW,
    APPROVED, PUBLISHED, ARCHIVED, REVOKED.
  - `ReleaseGateInputSchema` — validationsPassed, criticalFindings,
    fourEyesSatisfied, manifestPresent, checksumPresent, sourceVersionIds,
    versionPinsPresent, sourceJobState.
  - `ReleaseGateResultSchema` — passed + reasons.
- `packages/contracts/src/index.ts` — re-exported release contracts.
- `packages/domain/src/release.ts`
  - `ReleaseLabel` union (re-exported from contracts).
  - `ALLOWED_LABEL_TRANSITIONS` — DRAFT→INTERNAL_REVIEW→APPROVED→PUBLISHED;
    PUBLISHED→ARCHIVED; PUBLISHED→REVOKED; ARCHIVED→REVOKED.
  - `isLegalLabelTransition` / `assertLegalLabelTransition` — legal transition
    guards. `IllegalLabelError` on illegal transition.
  - `checkReleaseGate(input)` — returns `{ passed, reasons }`. Blocks when:
    validations not passed, critical findings > 0, four-eyes not satisfied,
    manifest missing, checksum missing, source version ids empty, version
    pins missing, or source job is FAILED_RETRYABLE / FAILED_TERMINAL / CANCELLED.
  - `assertReleaseGate(input)` — throws `ReleaseGateError` (with `reasons`)
    when the gate fails.
- `packages/domain/src/release.test.ts` — 29 tests: passing gate, each
  blocking condition, accumulated reasons, assertReleaseGate, label
  transitions (legal and illegal), ReleaseLabel type coverage.
- `packages/db/migrations/008_release_labels.sql`
  - Table `release_labels`: rendered_artifact_id, label, published_html,
    published_html_sha256, published_at, revoked_at, label_updated_at.
  - `release_labels_published_html_immutable()` trigger — BEFORE UPDATE
    rejects any change to `published_html` (published bytes are immutable).
  - Label CHECK constraint with all six labels.
  - RLS ENABLE + FORCE with tenant policy.
  - GRANT SELECT, INSERT, UPDATE (no DELETE).
  - Migration registry entry `008_release_labels`.
- `packages/db/src/release.ts`
  - `insertReleaseLabel` (ON CONFLICT rendered_artifact_id DO NOTHING),
    `getReleaseLabel`, `getReleaseLabelByArtifact`,
    `publishReleaseLabel` (sets published_html + PUBLISHED label),
    `updateReleaseLabel` (label transition + revoked_at for REVOKED).
- `packages/db/src/release.test.ts` — 22 tests: insert + ON CONFLICT,
  get/fallback, publishReleaseLabel UPDATE, updateReleaseLabel with
  revoked_at, migration 008 SQL structural checks (table, CHECK, trigger,
  RLS, GRANT, registry), tenant isolation.
- `packages/domain/src/index.ts` / `packages/db/src/index.ts` — re-exports.

### Commit 2 — `phase-9: export bundle and audit` (c96a35d)
- `packages/contracts/src/export.ts`
  - `ExportPermissionSchema` — allowed + deniedReason.
  - `ExportBundleResultSchema` — html, htmlSha256, watermarkIntact.
- `packages/domain/src/export.ts`
  - `ExportPermissionError`, `WatermarkIntactError` — error classes.
  - `assertExportPermission(input)` — throws when allowed=false.
  - `buildExportBundle(input)` — assembles an export bundle (HTML +
    sha256 + watermark). Verifies the watermark is intact (present in
    the HTML) before returning. Throws `WatermarkIntactError` when
    the watermark is missing.
  - `isWatermarkIntact(html, watermark)` — checks all four watermark
    fields (tenantId, artifactVersion, buildId, buildTime) are present
    in the HTML string.
- `packages/domain/src/export.test.ts` — 13 tests: assertExportPermission
  (allowed/denied/default), isWatermarkIntact (present/missing/partial/empty),
  buildExportBundle (intact/missing/partial/empty).
- `packages/db/migrations/009_export_audit.sql`
  - Table `export_audit` (append-only): artifact_id, exported_by, permitted,
    denied_reason, watermarked, html_sha256, exported_at.
  - `export_audit_immutable()` trigger — BEFORE UPDATE and BEFORE DELETE
    reject any mutation.
  - RLS ENABLE + FORCE with tenant policy.
  - GRANT SELECT, INSERT only (no UPDATE, no DELETE).
  - Migration registry entry `009_export_audit`.
- `packages/db/src/export-audit.ts`
  - `insertExportAudit` (INSERT only), `listExportAuditByArtifact`.
- `packages/db/src/export-audit.test.ts` — 14 tests: insert + INSERT-only,
  denied export storage, list by artifact, migration 009 SQL structural
  checks (table, immutability triggers, GRANT no UPDATE/DELETE, RLS,
  registry), tenant isolation.

### Commit 3 — `phase-9: export re-exports  -  gate passed` (37fca6a)
- `packages/domain/src/index.ts` — added re-exports for export domain
  (`assertExportPermission`, `buildExportBundle`, `isWatermarkIntact`,
  `ExportPermissionError`, `WatermarkIntactError`, and types).
- `packages/db/src/index.ts` — added re-exports for export audit DB
  (`insertExportAudit`, `listExportAuditByArtifact`, and types).

### Commit 4 — `phase-9: budget breaker  -  gate passed` (c681405)
- `packages/contracts/src/budget.ts`
  - `BudgetCheckSchema` — { spentMinorUnits, budgetMinorUnits } as `z.bigint()`.
  - `BudgetResultSchema` — { passed, remaining, overBy } as bigint.
  - `BudgetBreachResultSchema` — { breached: true, budget, reason }.
- `packages/contracts/src/index.ts` — re-exported budget contracts.
- `packages/domain/src/budget.ts`
  - `checkBudget(input)` — returns `{ passed, remaining, overBy }`.
    Over budget → `passed: false`; the caller must not call the provider.
    Uses bigint comparison (exact). `remaining = budget - spent`;
    `overBy = spent - budget` when over budget, null when within budget.
  - `BudgetBreaker` — a thin wrapper that holds a
    `DeterministicFakeProvider` and refuses to call it when over budget,
    returning a `BudgetBreachResult` instead. When within budget, it
    delegates to the provider.
- `packages/domain/src/budget.test.ts` — 12 tests: checkBudget (within,
  exact equal, over budget, overBy computation, zero budget, bigint
  precision past 2^53), BudgetBreaker (calls provider when within budget,
  does NOT call provider when over budget — spy verifies call count is 0,
  returns breach result with correct overBy, calls provider at exact budget,
  does not call even 1 minor unit over).
- `packages/db/migrations/010_project_budgets.sql`
  - Table `project_budgets`: tenant_id, project_id, budget_minor_units
    (bigint), spent_minor_units (bigint, default 0).
  - Non-negative CHECK constraints on both columns.
  - UNIQUE (tenant_id, project_id).
  - RLS ENABLE + FORCE with tenant policy.
  - GRANT SELECT, INSERT, UPDATE (no DELETE).
  - Migration registry entry `010_project_budgets`.
- `packages/db/src/budget.ts`
  - `insertProjectBudget` (ON CONFLICT tenant_id + project_id DO NOTHING),
    `getProjectBudget`, `increaseProjectBudgetSpent` (UPDATE spent +=
    amount). Bigint values passed as strings for pg compatibility.
- `packages/db/src/budget.test.ts` — 20 tests: insert + ON CONFLICT +
  bigint-as-string, get (found/throw), increaseProjectBudgetSpent (UPDATE +
  string + throw), migration 010 SQL structural checks (table, bigint
  columns, non-negative CHECKs, UNIQUE, RLS, GRANT no DELETE, registry),
  tenant isolation.
- `packages/domain/src/index.ts` / `packages/db/src/index.ts` — re-exports.

### Commit 5 — `phase-9: revocation  -  gate passed` (1ae05b3)
- `packages/contracts/src/revocation.ts`
  - `RevocationEventSchema` — artifactId, revokedBy, reason, revokedAt,
    priorLabel (ReleaseLabel enum).
- `packages/contracts/src/index.ts` — re-exported revocation contracts.
- `packages/domain/src/revocation.ts`
  - `revokeRelease(input)` — builds a revocation event record. Pure —
    does not mutate published bytes. Records the prior label (PUBLISHED
    or ARCHIVED) and the reason. Throws `RevocationInputError` for
    invalid priorLabel (must be PUBLISHED or ARCHIVED) or empty reason.
  - `RevocationInputError` — error class.
- `packages/domain/src/revocation.test.ts` — 8 tests: revokeRelease with
  PUBLISHED priorLabel, with ARCHIVED priorLabel, pure function (does not
  mutate published bytes — returns a new record), throws on invalid
  priorLabel (DRAFT, REVOKED), throws on empty reason, error message
  contains the bad label, does not reference or mutate any published HTML
  bytes (no `html` or `publishedHtml` property on the event).
- `packages/db/migrations/011_revocation_events.sql`
  - Table `revocation_events` (append-only): artifact_id, revoked_by,
    reason, revoked_at, prior_label (CHECK with all six labels).
  - `revocation_events_immutable()` trigger — BEFORE UPDATE and BEFORE
    DELETE reject any mutation.
  - RLS ENABLE + FORCE with tenant policy.
  - GRANT SELECT, INSERT only (no UPDATE, no DELETE).
  - Migration registry entry `011_revocation_events`.
- `packages/db/src/revocation.ts`
  - `insertRevocationEvent` (INSERT only), `listRevocationEventsByArtifact`.
- `packages/db/src/revocation.test.ts` — 17 tests: insert + INSERT-only,
  prior_label storage (PUBLISHED/ARCHIVED), does not touch published_html,
  list by artifact, migration 011 SQL structural checks (table, immutability
  triggers, GRANT no UPDATE/DELETE, RLS, prior_label CHECK, registry),
  migration 008 cross-check (published_html immutability trigger still
  present — revocation preserves published bytes), tenant isolation.
- `packages/domain/src/index.ts` / `packages/db/src/index.ts` — re-exports.

## Requirements matrix (Directive Phase 9)

| Directive requirement                                          | Delivered | Evidence                                              |
|----------------------------------------------------------------|-----------|-------------------------------------------------------|
| Release function requires: validations pass                   | Yes       | release.ts checkReleaseGate — validationsPassed       |
| critical findings = 0                                          | Yes       | release.ts checkReleaseGate — criticalFindings > 0 blocks |
| four-eyes approvals                                            | Yes       | release.ts checkReleaseGate — fourEyesSatisfied       |
| manifest                                                       | Yes       | release.ts checkReleaseGate — manifestPresent         |
| checksum                                                       | Yes       | release.ts checkReleaseGate — checksumPresent         |
| source versions                                                | Yes       | release.ts checkReleaseGate — sourceVersionIds empty blocks |
| version pins                                                   | Yes       | release.ts checkReleaseGate — versionPinsPresent      |
| source job not failed or cancelled                            | Yes       | release.ts BLOCKING_SOURCE_JOB_STATES                 |
| Labels: DRAFT, INTERNAL_REVIEW, APPROVED, PUBLISHED, ARCHIVED, REVOKED | Yes | release.ts ALLOWED_LABEL_TRANSITIONS; contracts ReleaseLabelSchema |
| Revoke writes an event                                         | Yes       | revocation.ts revokeRelease; db revocation.ts insertRevocationEvent |
| Revoke does not mutate published bytes                         | Yes       | migration 008 trigger protects published_html; revocation.ts pure |
| Export HTML only with permission                               | Yes       | export.ts assertExportPermission — throws when not allowed |
| Audit it (export)                                              | Yes       | db export-audit.ts insertExportAudit (append-only)    |
| Watermark intact (export)                                      | Yes       | export.ts isWatermarkIntact / buildExportBundle        |
| Project budget hard stop                                       | Yes       | budget.ts checkBudget — passed: false when over        |
| Over budget does not call the provider                         | Yes       | budget.ts BudgetBreaker — spy verifies provider not called |
| Audit append-only                                              | Yes       | migration 009 export_audit_immutable trigger; migration 011 revocation_events_immutable |
| Test: missing approval blocks                                  | Yes       | release.test.ts — fourEyesSatisfied=false blocks       |
| Test: critical finding blocks                                  | Yes       | release.test.ts — criticalFindings>0 blocks            |
| Test: revoke preserves bytes                                   | Yes       | revocation.test.ts — pure function; db revocation.test.ts migration 008 cross-check |
| Test: audit update denied                                      | Yes       | export-audit.test.ts — migration 009 trigger + GRANT no UPDATE |
| Test: budget breach skips provider                             | Yes       | budget.test.ts — spy verifies provider not called      |
| Test: export without permission denied                         | Yes       | export.test.ts — assertExportPermission throws         |
| Commit each finished unit separately                            | Yes       | 5 commits + this report                               |
| Do not push                                                    | Yes       | No push performed                                     |

## Open limitations (declared honestly per H05)

1. **Integration tests skipped.** The 101 skipped integration tests require
   a live PostgreSQL instance with migrations 001–011 applied and
   `DATABASE_URL`/`SUPERUSER_URL` set. They are not failed — they are
   skipped without a live database. The DB layer for release labels,
   export audit, project budgets, and revocation events is tested with a
   mock client only; the immutability triggers and RLS policies are
   verified structurally (the migration SQL contains the right clauses)
   but not executed against a real database.

2. **PDF export not built (carries forward from Phase 8).** No local pinned
   offline PDF renderer is available in the workspace. `renderPdf()` returns
   `status: "not_built"` with a visible English reason and no fake bytes.

3. **Budget breaker uses DeterministicFakeProvider.** The BudgetBreaker
   wrapper holds a DeterministicFakeProvider (R07 — no live LLM calls).
   When a live provider is integrated in a future phase, the same
   BudgetBreaker interface applies — but the current implementation only
   guards the fake provider.

4. **`pnpm -r lint` interactive prompt.** The `apps/web` package has a
   `next lint` script that prompts interactively (no `.eslintrc` in
   `apps/web`). The root `pnpm lint` script (`eslint . --max-warnings 0`)
   uses the flat config and passes with exit 0. The gate uses the root
   script, not `pnpm -r lint`.

## Residual risks

1. **Integration tests not exercised.** The DB layers for release labels
   (migration 008), export audit (migration 009), project budgets
   (migration 010), and revocation events (migration 011) are tested with
   a mock client only. The immutability triggers, RLS policies, and CHECK
   constraints have not been verified against a live PostgreSQL instance.
   The SQL structural tests confirm the migrations *contain* the right
   clauses, but execution against a real database is deferred to Phase 10
   (or a live CI run with `DATABASE_URL`).

2. **Budget check is caller-responsibility.** `checkBudget` and
   `BudgetBreaker` enforce the hard stop at the domain layer, but the DB
   layer (`increaseProjectBudgetSpent`) does not enforce the budget
   server-side — it simply accrues spent amounts. A caller that bypasses
   the BudgetBreaker could exceed the budget at the DB level. A
   server-side CHECK or trigger that rejects `spent > budget` would close
   this gap, but the directive does not require it ("Over budget does not
   call the provider" — a caller-side constraint).

3. **Revocation does not set the release label to REVOKED.** The domain
   `revokeRelease` function builds the event record only. The caller is
   responsible for both inserting the event (append-only) and calling
   `updateReleaseLabel(client, artifactId, "REVOKED")` to transition the
   label. This is by design (separation of concerns), but a caller that
   inserts the event without transitioning the label would leave the
   artifact in a PUBLISHED state with a revocation event — an
   inconsistency the DB layer does not prevent.

4. **Export watermark check is string-based.** `isWatermarkIntact` checks
   that all four watermark field values are substrings of the HTML. It
   does not parse the HTML DOM to verify they are in `<meta>` tags. A
   false positive is possible if a watermark value appears coincidentally
   in the rendered content. The renderer (Phase 8) embeds the watermark as
   `<meta>` tags, so this is not a practical risk for well-formed rendered
   HTML, but the check is not DOM-aware.

## Commit log (Phase 9)

```
b6b74d1 phase-9: release gate  -  gate passed
c96a35d phase-9: export bundle and audit
37fca6a phase-9: export re-exports  -  gate passed
c681405 phase-9: budget breaker  -  gate passed
1ae05b3 phase-9: revocation  -  gate passed
```

Phase 9 is complete. Stopping. Phase 10 has not been started.
