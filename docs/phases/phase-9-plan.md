# Phase 9 Plan — Release Gate, Export, Budget Breaker, Revocation

Status: Enterprise Candidate — Active Development

## In-scope items (from DIRECTIV.txt Phase 9)

1. Release function requires: validations pass, critical findings = 0,
   four-eyes approvals, manifest, checksum, source versions, version pins,
   source job not failed or cancelled.
2. Labels: DRAFT, INTERNAL_REVIEW, APPROVED, PUBLISHED, ARCHIVED, REVOKED.
3. Revoke writes an event. It does not mutate published bytes.
4. Export HTML only with permission. Audit it. Watermark intact.
5. Project budget hard stop. Over budget does not call the provider.
6. Audit append-only.
7. Tests: missing approval blocks; critical finding blocks; revoke preserves
   bytes; audit update denied; budget breach skips provider; export without
   permission denied.

## Commit order (one commit per finished unit)

1. `phase-9: release domain  -  gate passed` — `packages/domain/src/release.ts`
   + `packages/domain/src/release.test.ts` + re-export from
   `packages/domain/src/index.ts`.
   - `ReleaseLabel` union: DRAFT, INTERNAL_REVIEW, APPROVED, PUBLISHED,
     ARCHIVED, REVOKED.
   - `ReleaseGateInput` + `checkReleaseGate` — returns
     `{ passed: boolean; reasons: string[] }`. Blocks when:
     - validations not passed (`validationsPassed === false`)
     - critical findings > 0
     - four-eyes not satisfied (no independent approver)
     - manifest missing
     - checksum (htmlSha256) missing
     - source version ids empty
     - any version pin missing
     - source job state is FAILED_RETRYABLE, FAILED_TERMINAL, or CANCELLED
   - `assertReleaseGate` — throws `ReleaseGateError` (with `reasons`) when
     `checkReleaseGate` returns `passed: false`.
   - `revokeRelease(input)` — returns a revocation event record
     (`{ artifactId; revokedBy; reason; revokedAt }`). Pure — does not mutate
     published bytes. Records the prior label (PUBLISHED) and the new label
     (REVOKED).
   - `BudgetResult` + `checkBudget` — `input: { spentMinorUnits; budgetMinorUnits }`
     → `{ passed: boolean; remaining: bigint; overBy: bigint | null }`.
     Over budget → `passed: false`; the caller must not call the provider.
   - `ExportPermissionInput` + `assertExportPermission` — throws
     `ExportPermissionError` when `allowed === false`. Export is denied without
     permission.

2. `phase-9: release contracts  -  gate passed` —
   `packages/contracts/src/release.ts` + re-export from
   `packages/contracts/src/index.ts`.
   - `ReleaseLabelSchema` (z.enum of the six labels).
   - `ReleaseGateInputSchema`, `ReleaseGateResultSchema`.
   - `RevocationEventSchema`.
   - `BudgetCheckSchema` / `BudgetResultSchema`.
   - `ExportPermissionSchema`.

3. `phase-9: release DB layer  -  gate passed` — migration
   `008_release_revocation_export.sql` + `packages/db/src/release.ts` +
   `packages/db/src/release.test.ts` + re-export from
   `packages/db/src/index.ts`.
   - Tables: `release_labels` (one row per rendered artifact; label +
     immutability of published bytes via trigger rejecting UPDATE of
     `published_html`), `revocation_events` (append-only), `export_audit`
     (append-only), `project_budgets`.
   - `release_labels`: rendered_artifact_id, label, published_html (the
     immutable published bytes), published_html_sha256, published_at,
     revoked_at, label_updated_at. Trigger rejects UPDATE of
     `published_html` (published bytes are immutable). Label transitions are
     allowed (DRAFT→INTERNAL_REVIEW→APPROVED→PUBLISHED; PUBLISHED→ARCHIVED;
     PUBLISHED→REVOKED sets revoked_at). GRANT SELECT, INSERT, UPDATE (only
     label/revoked_at columns updatable).
   - `revocation_events`: append-only (INSERT only). Trigger rejects UPDATE
     and DELETE. Columns: artifact_id, revoked_by, reason, revoked_at,
     prior_label.
   - `export_audit`: append-only (INSERT only). Columns: artifact_id,
     exported_by, permitted, denied_reason, watermarked (bool), sha256, time.
   - `project_budgets`: tenant_id, project_id, budget_minor_units (bigint),
     spent_minor_units (bigint, default 0). Updated as usage accrues.
   - DB functions: `insertReleaseLabel`, `getReleaseLabel`, `updateReleaseLabel`,
     `insertRevocationEvent`, `listRevocationEventsByArtifact`,
     `insertExportAudit`, `listExportAuditByArtifact`, `getProjectBudget`,
     `increaseProjectBudgetSpent`.
   - Tests: mock client SQL inspection + migration 008 structural checks (tables,
     RLS, immutability triggers, GRANT INSERT-only on append-only tables,
     registry entry).

4. `phase-9: export bundle  -  gate passed` —
   `packages/domain/src/export.ts` + `packages/domain/src/export.test.ts` +
   re-export from `packages/domain/src/index.ts`.
   - `ExportBundleInput` + `buildExportBundle` — assembles an export bundle
     (HTML + watermark + sha256) from a rendered artifact. Verifies the
     watermark is intact (present in HTML) before returning the bundle. Throws
     `WatermarkIntactError` (or returns `watermarkIntact: false`) when the
     watermark is missing from the HTML.
   - Pure function — no I/O. The caller passes the rendered HTML and the
     watermark metadata; the function checks the watermark is embedded.

5. `phase-9: budget breaker  -  gate passed` — already covered in commit 1
   (`checkBudget`); this commit adds the integration test
   `packages/domain/src/budget.test.ts` that verifies: over budget → the
   caller must skip the provider call (the domain function returns
   `passed: false` and the test asserts the fake provider is not called).
   Also adds `BudgetBreaker` class — a thin wrapper that holds a
   `DeterministicFakeProvider` and refuses to call it when over budget,
   returning a `BudgetBreachResult` instead.

   Wait — re-reading the directive: "Commit each finished unit separately:
   release gate, export bundle, budget breaker, revocation." So the four
   units are: (1) release gate, (2) export bundle, (3) budget breaker,
   (4) revocation. Let me re-map the commit order to match the user's named
   units.

## Revised commit order (matching the user's four named units)

1. `phase-9: release gate  -  gate passed` — release domain + contracts +
   DB layer (migration 008 + release.ts) + tests. Covers the release gate
   function, labels, and the DB layer for release labels + append-only audit.
2. `phase-9: export bundle  -  gate passed` — `packages/domain/src/export.ts`
   + tests + re-export. Export permission, watermark intact check, export
   audit (DB function already in commit 1's migration).
3. `phase-9: budget breaker  -  gate passed` — `packages/domain/src/budget.ts`
   + tests + re-export. `checkBudget` + `BudgetBreaker` wrapper that refuses
   to call the provider when over budget.
4. `phase-9: revocation  -  gate passed` — revocation domain logic (already
   in commit 1's `release.ts` as `revokeRelease`) + the DB `insertRevocationEvent`
   + `listRevocationEventsByArtifact` + a focused test that revoke preserves
   published bytes (the DB trigger rejects UPDATE of `published_html`).
5. `phase-9: report  -  gate passed` — `docs/phases/phase-9-report.md`.

## Out of scope (Phase 9 only)

- Phase 10: golden fixtures, scorecard, backup runbook.
- Live LLM calls (R07 — DeterministicFakeProvider only).
- No new agents, modules, or vendors beyond the directive.

## Gate

```
pnpm typecheck
pnpm test
pnpm lint
```

All must exit 0.

## Open limitations (declared honestly)

- Integration tests (`.integration.test.ts`) require a live PostgreSQL with
  migrations 001–008 applied. They are skipped without `DATABASE_URL`.
- PDF export is not built (Phase 8 open limitation carries forward).
