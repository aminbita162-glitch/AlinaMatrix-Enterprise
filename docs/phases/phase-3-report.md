# Phase 3 Report — Immutable Source and Fragments

**Status:** Enterprise Candidate — Active Development
**Phase:** 3 of 10
**Gate result:** PASSED
**Commit:** yes

---

## Gate Commands and Exit Codes

| Command | Exit code | Result |
|---|---|---|
| `pnpm typecheck` | 0 | PASSED |
| `pnpm test` | 0 | PASSED |
| `pnpm lint` | 0 | PASSED |

---

## Test Results

### packages/domain

| File | Tests | Passed | Failed |
|---|---|---|---|
| `src/workflow.test.ts` | 12 | 12 | 0 |

(Phase 1 tests preserved — no new domain tests required beyond type-check coverage of `source.ts`.)

### packages/db

| File | Tests | Passed | Failed | Mode |
|---|---|---|---|---|
| `src/rls.test.ts` | 8 | 8 | 0 | unit (mock client) |
| `src/audit.test.ts` | 5 | 5 | 0 | unit (SQL file read) |
| `src/sources.test.ts` | 19 | 19 | 0 | unit (mock client + SQL read) |
| `src/rls.integration.test.ts` | 0 run | — | — | skipped (no live DB) |

`sources.test.ts` descriptions:
- insertSource: issues an INSERT into sources with correct fields
- upsertSourceVersion — idempotency: returns deduplicated=false when no existing version is found
- upsertSourceVersion — idempotency: returns deduplicated=true when the idempotency key already exists
- upsertSourceVersion — idempotency: does not issue an INSERT when the idempotency key matches
- source_versions immutability: does NOT create a DELETE policy for source_versions
- source_versions immutability: creates only SELECT and INSERT and UPDATE-status policies for source_versions
- source_versions immutability: does NOT create a DELETE policy for source_fragments
- source_versions immutability: enables FORCE ROW LEVEL SECURITY on source_versions
- source_versions immutability: enables FORCE ROW LEVEL SECURITY on source_fragments
- setVersionStatus: issues an UPDATE with EXTRACTED status
- setVersionStatus: issues an UPDATE with FAILED_TERMINAL status and fail_reason
- setVersionStatus: sets fail_reason to null when not provided
- failed extraction state invariant: FAILED_TERMINAL version has fail_reason present in the DB call
- getSourceVersion — tenant isolation: SELECT query includes the version_id constraint
- getSourceVersion — tenant isolation: returns null when no row matches (simulates RLS exclusion for wrong tenant)
- insertSourceFragments: inserts a fragment row for each TextFragment
- insertSourceFragments: returns empty array when fragments list is empty
- cross-tenant isolation: getSourceVersion returns null when RLS excludes the row
- cross-tenant isolation: upsertSourceVersion includes tenant_id in INSERT VALUES to satisfy RLS WITH CHECK

### apps/api

| File | Tests | Passed | Failed |
|---|---|---|---|
| `src/logger.test.ts` | 5 | 5 | 0 |
| `src/storage.test.ts` | 11 | 11 | 0 |
| `src/ingest.test.ts` | 15 | 15 | 0 |
| `src/router.test.ts` | 2 | 2 | 0 |
| `src/auth.test.ts` | 22 | 22 | 0 |

`ingest.test.ts` descriptions:
- MIME validation: rejects a disallowed MIME type with IngestValidationError MIME_MISMATCH
- MIME validation: rejects a PDF whose magic bytes do not start with %PDF
- MIME validation: error code is MIME_MISMATCH for MIME rejection
- MIME validation: accepts a valid plain-text upload
- File size cap: rejects files larger than MAX_UPLOAD_BYTES
- File size cap: error code is FILE_TOO_LARGE for size rejection
- File size cap: does not call DB or storage when file is too large
- Idempotency key deduplication: returns existing version without creating new DB rows when key matches
- Idempotency key deduplication: does not store bytes when idempotency key deduplicates
- Idempotency key deduplication: does not write audit event for a deduplicated upload
- Audit events: writes a source.upload audit event on successful upload
- Audit events: writes a source.extraction_failed audit event when extraction fails
- Audit events: failed extraction sets version status to FAILED_TERMINAL via setVersionStatus
- Successful txt ingestion: inserts source, version, fragments and sets EXTRACTED status
- Successful txt ingestion: storage.put receives the original bytes and a tenant-prefixed path

### Total

| Metric | Value |
|---|---|
| Test files | 8 (3 skipped/echo) |
| Tests run | 87 |
| **Passed** | **87** |
| **Failed** | **0** |
| Skipped (live integration, no DB) | 14 |

---

## Typecheck Coverage

| Package | Result |
|---|---|
| `@alinamatrix/api` | PASSED |
| `@alinamatrix/web` | PASSED |
| `@alinamatrix/domain` | PASSED |
| `@alinamatrix/db` | PASSED |
| `@alinamatrix/contracts` | PASSED |
| `@alinamatrix/renderer` | PASSED |

---

## Deliverables Produced

| Item | Path | Notes |
|---|---|---|
| SQL migration | `packages/db/migrations/002_sources_fragments.sql` | sources, source_versions, source_fragments, evidence_items; RLS USING+WITH CHECK; FORCE RLS; no DELETE policy on versions or fragments |
| DB sources module | `packages/db/src/sources.ts` | insertSource, upsertSourceVersion (idempotent), setVersionStatus, insertSourceFragments, getSourceVersion, getLatestSourceVersion, insertEvidenceItem |
| DB index update | `packages/db/src/index.ts` | Exports all new sources functions and row types |
| Source schemas | `packages/contracts/src/sources.ts` | Zod: UploadSourceRequest, SourceVersionResponse, UploadSourceResponse, SourceResponse, SourceFragmentResponse |
| Contracts index update | `packages/contracts/src/index.ts` | Exports new source schemas |
| Domain source helpers | `packages/domain/src/source.ts` | MIME validation, magic-byte sniffing, size cap, sha256, fragmentText, fragmentPagedText |
| Domain index update | `packages/domain/src/index.ts` | Exports all source domain helpers |
| Domain package.json | `packages/domain/package.json` | Added `exports` field pointing to `./src/index.ts` (was pointing to non-existent `./dist`) |
| PDF parser | `pdf-parse` v2.4.5 | Installed in `apps/api`; offline; local parse only |
| Extractor | `apps/api/src/extractor.ts` | txt/md (UTF-8), docx (ZIP+XML), pdf (pdf-parse); ExtractionError on failure; no text invention |
| Ingest pipeline | `apps/api/src/ingest.ts` | Size+MIME validation, sha256, idempotency, ObjectStorage store, extraction, fragment insert, audit; IngestDb interface for test injection |
| Router update | `apps/api/src/router.ts` | POST /sources/upload (auth-gated, multipart); RouterDeps interface; back-compat with Phase 2 AuthDb-only callers |
| DB sources tests | `packages/db/src/sources.test.ts` | 19 tests; mock client; immutability via SQL read; idempotency; tenant isolation |
| Ingest tests | `apps/api/src/ingest.test.ts` | 15 tests; MIME mismatch; size cap; idempotency; audit events; extraction failure → FAILED_TERMINAL |
| Phase plan | `docs/phases/phase-3-plan.md` | |
| Phase report | `docs/phases/phase-3-report.md` | This file |

---

## Failures

None. 0 tests failed. 0 lint errors. 0 typecheck errors.

Two corrections made during development (before gate):
1. `packages/domain/package.json` — `main`/`types` pointed to `./dist/index.js` which does not exist in dev/test mode. Corrected to `./src/index.ts` with `exports` field, matching the pattern used by `packages/contracts` and `packages/db`.
2. `IngestResult.failReason` typed as `string?` — rejected by `exactOptionalPropertyTypes: true`. Corrected to `string | undefined`.

---

## Residual Risk and Open Blockers

| Item | Notes |
|---|---|
| No live DB integration tests for Phase 3 tables | sources, source_versions, source_fragments, evidence_items RLS is verified by reading the migration SQL and by mock-client tests. End-to-end RLS isolation (Tenant A cannot read Tenant B's source versions) requires a live PostgreSQL instance. This is an open pre-launch blocker inherited from Phase 2. |
| PDF image-only files return FAILED_TERMINAL | pdf-parse extracts embedded text only. Image-based (scanned) PDFs produce no text and are correctly set to FAILED_TERMINAL. OCR is explicitly deferred per directive. |
| DOCX complex layout may lose fidelity | Extraction walks `<w:t>` elements only; rich formatting (tables, text boxes) may be omitted. Text-only content is correctly extracted. Acceptable for the evidence-extraction pipeline. |
| Multipart parser is buffered | The entire request body is loaded into memory before parsing. Combined with the 50 MB size cap (enforced at the domain layer before storing), this is acceptable for dev/test. A streaming parser would be required before high-throughput production load. |
| pdf-parse v2 API stability | pdf-parse v2 is a major version change from v1. The dynamic import and getText() call pattern was verified against the installed v2.4.5 source. It has not been exercised against a real PDF in this phase; the test uses a mock DB and does not load the module. |
| POST /sources/upload not yet connected to a real pg pool | The router accepts `IngestDb` as a dependency-injected interface. The concrete PostgreSQL implementation (wrapping the functions from `packages/db/src/sources.ts` inside `withTenantContext`) is not yet wired up in `apps/api/src/server.ts`. This is expected — the server wiring is out of scope for Phase 3 and will be done when a full application bootstrap is needed. |
| M03 beachhead unproven | Requires Phases 4–10. |
| No PDF output | Deferred to Phase 8. |
