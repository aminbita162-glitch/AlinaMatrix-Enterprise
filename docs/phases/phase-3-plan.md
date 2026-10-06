# Phase 3 Plan — Immutable Source and Fragments

**Status:** Enterprise Candidate — Active Development
**Phase:** 3 of 10

---

## In-Scope Items

### Database

- Migration `002_sources_fragments.sql`
  - Tables: `sources`, `source_versions`, `source_fragments`, `evidence_items`
  - RLS USING and WITH CHECK on all new tables (tenant-scoped)
  - Unique constraint on `source_versions(sha256)` per source — second write of identical bytes rejected
  - Idempotency key unique constraint on `source_versions`
  - Immutability: no UPDATE/DELETE policies on `source_versions` or `source_fragments`
  - Fragment fields: `ordinal`, `page` (nullable), `text`, `char_start`/`char_end` span, `hash`

### packages/contracts

- `sources.ts` — Zod schemas: `UploadSourceRequest`, `SourceResponse`, `SourceVersionResponse`, `SourceFragmentResponse`, `EvidenceItemResponse`, `UploadSourceResponseSchema`
- Export from `packages/contracts/src/index.ts`

### packages/domain

- `source.ts` — allowed MIME types, max upload size constant, `validateMimeType()`, `computeSha256()`, `fragmentText()` (splits plain text into fragments by paragraph/page boundary)

### packages/db

- `sources.ts` — DB access functions:
  - `insertSource(client, tenantId, projectId, name, mimeType)` → source row
  - `insertSourceVersion(client, sourceId, tenantId, sha256, sizeBytes, idempotencyKey, storagePath)` → version row or idempotency match
  - `insertSourceFragment(client, versionId, tenantId, ordinal, page, text, charStart, charEnd, hash)` → fragment row
  - `insertEvidenceItem(client, versionId, tenantId, fragmentId, kind, text)` → evidence row
  - `setVersionStatus(client, versionId, status, failReason?)` → update extraction status
  - `getSourceVersion(client, versionId, tenantId)` → version row
- `sources.test.ts` — unit tests (mock client): immutability assertions, idempotency key collision, tenant isolation, failed extraction stays FAILED_TERMINAL

### apps/api

- `extractor.ts` — offline extraction:
  - `.txt` / `.md`: read as UTF-8 directly
  - `.docx`: basic XML extraction (unzip + parse `word/document.xml`)
  - `.pdf`: use `pdf-parse` (offline); on any failure set `FAILED_TERMINAL` with English reason; do not invent text
  - Returns `{ text: string; mimeType: string }` or throws `ExtractionError`
- `ingest.ts` — upload pipeline:
  - Parse multipart form body (using Node built-ins, no extra framework)
  - Enforce max file size (reject early via Content-Length or streamed byte count)
  - MIME sniff actual bytes (magic bytes check); reject if sniffed MIME ≠ declared extension MIME
  - Compute sha256 of bytes
  - Check idempotency key; if duplicate version already exists, return existing version ID (no second row)
  - Store original bytes via `ObjectStorage`
  - Insert `sources`, `source_versions` row with status `INGESTED`
  - Dispatch extraction inline (sync, test-friendly): fragment, set status `EXTRACTED` or `FAILED_TERMINAL`
  - Audit upload and extraction failure events
- `router.ts` update:
  - `POST /sources/upload` — authenticated route (session required); calls ingest pipeline
  - `GET /sources/:id` — returns source + latest version status

### Tests

- `packages/db/src/sources.test.ts`:
  - Immutability: source_versions cannot be updated (no UPDATE policy → SQL verifies migration)
  - Idempotency: same idempotency key returns existing version, no duplicate inserted
  - Tenant isolation: version inserted for tenant A is not visible under tenant B context
  - Failed extraction: status FAILED_TERMINAL, fail_reason present, fragments not created
- `apps/api/src/ingest.test.ts`:
  - MIME mismatch (magic bytes vs extension) → rejected
  - Size cap exceeded → rejected
  - Duplicate idempotency key → 200 with existing version ID, no second DB row
  - Audit event written on upload
  - Audit event written on extraction failure
  - Valid txt upload → fragments created, status EXTRACTED

---

## Out of Scope

- OCR vendor, audio, web fetch, embeddings, claims (Phase 4+)
- PDF OCR (image-based PDFs fail with FAILED_TERMINAL — acceptable)

---

## Residual Risk (Pre-Implementation)

- `pdf-parse` may not handle all PDF variants; on parse failure we set FAILED_TERMINAL, which is correct
- No streaming multipart parser: for large files, entire body is buffered in memory — acceptable for dev/test with the size cap enforced
- DOCX extraction is structural XML parsing only; complex layouts may lose fidelity — acceptable, text-only extraction
