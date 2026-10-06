# Release Scorecard — AlinaMatrix Enterprise

Status: Enterprise Candidate — Active Development

> No production claim is made. This scorecard records what is tested and what
> remains open. Any open critical blocker forces FAIL — it is not averaged away.
>
> **Render candidate — not production.** A Render Blueprint
> (`render.yaml`) defines a deployment surface for the web app, the Node HTTP
> API, and a managed PostgreSQL 16 database. It is a candidate blueprint, not a
> production deployment. Secrets are read from the host environment; no secret
> is committed. Integration tests remain skipped without a live database and
> are not run by the blueprint.

## Overall verdict

**FAIL — not production-ready.** Open critical blockers remain (see below).
Status: Enterprise Candidate — Active Development. Render candidate — not
production.

## Critical blockers

| # | Blocker | Status | Evidence |
|---|---------|--------|----------|
| C1 | Integration tests not exercised | Open | 101 integration tests skipped without `DATABASE_URL`; RLS, immutability triggers, and CHECK constraints are structurally verified but not executed against a live PostgreSQL instance |
| C2 | PDF not built | **Closed** | Phase B pinned `pdfkit@0.20.2` (pure-JS, no native deps, no network). `renderPdf()` is async and emits real `%PDF-` bytes with the watermark + status line as visible text and in the info dictionary (`Title`, `Subject`, `Keywords`). `packages/renderer/src/pdf.test.ts` (13 tests) verifies: status is `"built"`, bytes start with `%PDF-`, `bytes` is a non-empty `Uint8Array`, `sha256` is a 64-char hex string, sha256 is deterministic (same inputs → same sha256), watermark + status line are embedded, unknown assertion keys are dropped, and `PdfNotAvailableError` is a proper `Error`. `computePdfContentSha256` is the sync variant for the content hash |
| C3 | No live LLM verification | Open | All agent outputs use `DeterministicFakeProvider` (R07); determinism is structural, not semantic — no real model call has been made |
| C4 | Security coverage is unit-level only | Open | Auth bypass, authz bypass, tenant breach, prompt injection, bad upload, XSS, and SQL injection are covered by unit tests with mock doubles — not by live integration tests |
| C5 | No regional disaster recovery | Open | No DR site, no cross-region replication, no backup restore drill against a live database |

## Security coverage (from tests)

| Threat | Test coverage | Status | Evidence |
|--------|---------------|--------|----------|
| Auth bypass (T01) | Unit test — mock AuthDb | Passed | `apps/api/src/auth.test.ts`: login returns null for wrong password, unknown email, no membership; cookie flags verified |
| Authz bypass (T02) | Unit test — mock AuthDb | Passed | `packages/db/src/rls.test.ts`: tenant context set/clear; `apps/api/src/auth.test.ts`: session resolution |
| Tenant breach (T03) | Unit test — mock client | Passed | `packages/db/src/rls.test.ts`: `setTenantContext` validates UUID, rejects SQL injection in tenant_id; `packages/domain/src/agents.test.ts`: cache key differs per tenant |
| Prompt injection (T05) | Unit test — DeterministicFakeProvider | Passed | `packages/db/src/injection.test.ts` + `packages/domain/src/golden.test.ts`: injected source text does not change plan; output does not contain "RELEASED" |
| Bad upload (T11) | Unit test — mock storage | Passed | `apps/api/src/ingest.test.ts`: MIME mismatch rejected, size cap enforced, DOCX with bad magic bytes → FAILED_TERMINAL |
| XSS in rendered HTML (T09) | Unit test — renderer | Passed | `packages/renderer/src/replay.test.ts`: unknown assertion keys dropped; `packages/renderer/src/html.ts`: all values escaped |
| SQL injection (T10) | Unit test — mock client | Passed | `packages/db/src/rls.test.ts`: non-UUID tenant_id rejected before reaching DB; parameterised queries only |

## Release gate checks (from Phase 9)

| Check | Status | Evidence |
|-------|--------|----------|
| Validations pass | Passed | `packages/domain/src/release.test.ts`: `checkReleaseGate` — validationsPassed=false blocks |
| Critical findings = 0 | Passed | `packages/domain/src/release.test.ts`: criticalFindings>0 blocks |
| Four-eyes approvals | Passed | `packages/domain/src/review.test.ts`: `assertFourEyes` — author cannot be sole approver |
| Manifest present | Passed | `packages/domain/src/release.test.ts`: manifestPresent=false blocks |
| Checksum present | Passed | `packages/domain/src/release.test.ts`: checksumPresent=false blocks |
| Source versions | Passed | `packages/domain/src/release.test.ts`: empty sourceVersionIds blocks |
| Version pins | Passed | `packages/domain/src/release.test.ts`: versionPinsPresent=false blocks |
| Source job not failed/cancelled | Passed | `packages/domain/src/release.test.ts`: FAILED_RETRYABLE, FAILED_TERMINAL, CANCELLED block |

## Budget breaker (from Phase 9)

| Check | Status | Evidence |
|-------|--------|----------|
| Over budget does not call provider | Passed | `packages/domain/src/budget.test.ts`: spy verifies provider not called when over budget |
| Budget breach returns reason | Passed | `packages/domain/src/budget.test.ts`: breach result contains overBy and reason |
| Bigint precision | Passed | `packages/domain/src/budget.test.ts`: values past 2^53 compared exactly |

## Revocation (from Phase 9)

| Check | Status | Evidence |
|-------|--------|----------|
| Revoke writes an event | Passed | `packages/domain/src/revocation.test.ts`: `revokeRelease` returns event record |
| Revoke does not mutate bytes | Passed | `packages/domain/src/revocation.test.ts`: pure function, no `html` or `publishedHtml` property |
| Revocation event is append-only | Passed (structural) | `packages/db/src/revocation.test.ts`: migration 011 trigger rejects UPDATE/DELETE; GRANT SELECT, INSERT only |

## Export (from Phase 9)

| Check | Status | Evidence |
|-------|--------|----------|
| Export without permission denied | Passed | `packages/domain/src/export.test.ts`: `assertExportPermission` throws |
| Watermark intact | Passed | `packages/domain/src/export.test.ts`: `isWatermarkIntact` checks all four fields |
| Export audit append-only | Passed (structural) | `packages/db/src/export-audit.test.ts`: migration 009 trigger rejects UPDATE/DELETE |

## Golden fixtures (from Phase 10)

| Fixture | Status | Evidence |
|---------|--------|----------|
| Happy ADR | Passed | `packages/domain/src/golden.test.ts`: guard returns APPROVED |
| Contradiction | Passed | `packages/domain/src/golden.test.ts`: flagged claim → NEEDS_REVIEW |
| Prompt injection | Passed | `packages/domain/src/golden.test.ts`: injection does not change plan |
| Missing citation | Passed | `packages/domain/src/golden.test.ts`: unknown claim id rejected |
| Unit mismatch | Passed | `packages/domain/src/golden.test.ts`: days vs weeks flagged, no auto-correct |
| Cross-tenant | Passed | `packages/domain/src/golden.test.ts`: cache key differs per tenant |

## PDF renderer (from Phase B — blocker C2 closed)

| Check | Status | Evidence |
|-------|--------|----------|
| Status is `"built"` | Passed | `packages/renderer/src/pdf.test.ts`: `renderPdf` returns `status: "built"` |
| Real PDF bytes | Passed | `packages/renderer/src/pdf.test.ts`: bytes start with `%PDF-`; `bytes` is a non-empty `Uint8Array` |
| Content sha256 deterministic | Passed | `packages/renderer/src/pdf.test.ts`: same inputs → same `sha256`; matches `computePdfContentSha256` |
| Watermark + status line embedded | Passed | `packages/renderer/src/pdf.test.ts`: status line + watermark (tenant, build id, build time) present |
| Unknown assertion keys dropped | Passed | `packages/renderer/src/pdf.test.ts`: only known M03 section keys rendered |
| Pinned offline renderer | Passed | `pdfkit@0.20.2` in `packages/renderer/package.json` + `pnpm-lock.yaml`; pure-JS, no native deps, no network |

## Render deployment surface (Phase F — candidate, not production)

| Check | Status | Evidence |
|-------|--------|----------|
| Blueprint exists | Passed | `render.yaml` — web, api, PostgreSQL 16 |
| Secrets not committed | Passed | `DATABASE_URL` is a `fromDatabase` reference; no secret value in `render.yaml` |
| API health check | Passed | `healthCheckPath: /health` (`apps/api/src/router.ts` `GET /health`); `server.ts` reads `process.env.PORT` |
| Web health check | Passed | `healthCheckPath: /`; Next.js `next start` |
| Label | Passed | "Render candidate — not production" (see header) |

## Pre-launch blockers (must be closed before production)

1. **Run integration tests against a live PostgreSQL instance.** All 101
   skipped integration tests must pass with `DATABASE_URL` and
   `SUPERUSER_URL` set and migrations 001–014 applied.

2. **Verify with a live LLM.** DeterministicFakeProvider must be replaced
   with a real model call, and the determinism invariants (same inputs →
   same plan hash) must be re-verified.

3. **Set up backup and restore drill.** `scripts/backup-drill.sh` exists
   but has not been run against a live database. See
   `docs/runbooks/backup-restore.md`.

4. **Security penetration testing.** Unit tests with mock doubles are not
   a substitute for penetration testing against a live deployment.

> The PDF renderer blocker (formerly C2) was closed in Phase B by a recorded
> test (`packages/renderer/src/pdf.test.ts`). It is removed from the
> pre-launch blocker list above. Every other blocker remains open.

No production claim is made. Do not deploy as a production system.
Render candidate — not production.
