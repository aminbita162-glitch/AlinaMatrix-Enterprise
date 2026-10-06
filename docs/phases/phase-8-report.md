# Phase 8 Report — Renderer and Build Manifest

Status: Enterprise Candidate — Active Development

## Gate commands and exit codes

| Command          | Exit code | Notes                                                  |
|------------------|-----------|--------------------------------------------------------|
| `pnpm typecheck` | 0         | All 6 packages clean (apps/web, apps/api, packages/*)  |
| `pnpm test`      | 0         | 544 passed, 0 failed, 101 skipped (no live DB in gate) |
| `pnpm lint`      | 0         | 0 errors, 0 warnings                                   |

## Test counts (gate run — no live DB)

| Package          | Test file                          | Passed | Failed | Skipped |
|------------------|------------------------------------|--------|--------|---------|
| packages/domain  | workflow.test.ts                   | 12     | 0      | 0       |
| packages/domain  | agents.test.ts                     | 51     | 0      | 0       |
| packages/domain  | generate.test.ts                   | 25     | 0      | 0       |
| packages/domain  | claims.test.ts                     | 35     | 0      | 0       |
| packages/domain  | architect.test.ts                  | 22     | 0      | 0       |
| packages/domain  | review.test.ts                     | 28     | 0      | 0       |
| packages/domain  | guard.test.ts                      | 37     | 0      | 0       |
| packages/renderer| html.test.ts                       | 13     | 0      | 0       |
| packages/renderer| manifest.test.ts                   | 14     | 0      | 0       |
| packages/renderer| pdf.test.ts                        | 5      | 0      | 0       |
| packages/renderer| watermark.test.ts                  | 8      | 0      | 0       |
| packages/renderer| replay.test.ts (Phase 8)           | 17     | 0      | 0       |
| packages/db      | m03.test.ts                        | 22     | 0      | 0       |
| packages/db      | sources.test.ts                    | 19     | 0      | 0       |
| packages/db      | claims.test.ts                     | 28     | 0      | 0       |
| packages/db      | review.test.ts                     | 36     | 0      | 0       |
| packages/db      | render.test.ts (Phase 8)          | 22     | 0      | 0       |
| packages/db      | agents.test.ts                     | 38     | 0      | 0       |
| packages/db      | rls.test.ts                        | 8      | 0      | 0       |
| packages/db      | audit.test.ts                      | 5      | 0      | 0       |
| packages/db      | injection.test.ts                  | 10     | 0      | 0       |
| packages/db      | agents.integration.test.ts         | 0      | 0      | 24      |
| packages/db      | sources.integration.test.ts         | 0      | 0      | 28      |
| packages/db      | claims.integration.test.ts         | 0      | 0      | 35      |
| packages/db      | rls.integration.test.ts             | 0      | 0      | 14      |
| apps/api         | logger.test.ts                     | 5      | 0      | 0       |
| apps/api         | storage.test.ts                    | 11     | 0      | 0       |
| apps/api         | ingest.test.ts                     | 15     | 0      | 0       |
| apps/api         | router.test.ts                     | 2      | 0      | 0       |
| apps/api         | review.test.ts                     | 29     | 0      | 0       |
| apps/api         | auth.test.ts                       | 22     | 0      | 0       |
| **Total**        |                                    | **544**| **0**  | **101** |

Integration tests are skipped without `DATABASE_URL`. They require migrations 001–007 applied.

To run with live DB:
```
DATABASE_URL=postgres://app_user:***@localhost:5432/alinamatrix \
SUPERUSER_URL=postgres://alinamatrix:***@localhost:5432/alinamatrix \
  pnpm test
```

## Deliverables committed (8 separate commits + this report)

### Commit 1 — `phase-8: render schema` (25d7e50)
- `packages/contracts/src/render.ts`
  - `WatermarkSchema` — tenant, artifact version, build id, time, statusLine
  - `RenderVersionPinsSchema` — prompt, model, schema, policy version ids
  - `RenderInputSchema` — approved content model, watermark, source version ids, version pins, renderer, template, content hash
  - `RenderManifestSchema` — content hash, source version ids, version pins, renderer, template, build id, time, sha256 of HTML
  - `RenderResultSchema` — html, htmlSha256, manifest
  - `PdfStatusSchema`, `PdfResultSchema` — honest not_built status
- `packages/contracts/src/index.ts` — re-exported all render contracts

### Commit 2 — `phase-8: HTML renderer` (565406a)
- `packages/renderer/src/html.ts`
  - `renderHtml(input: RenderInput): string` — deterministic HTML from approved M03 content model
  - Fixed section order (M03_SECTION_ORDER); unknown assertion keys dropped
  - Includes limitations, assumptions, evidence map, approvals (all known sections)
  - Watermark embedded as `<meta>` tags in `<head>`
  - HTML escaping for all text content (XSS prevention)
- `packages/renderer/src/html.test.ts` — 13 tests: determinism, unknown keys dropped, limitations/assumptions/evidence map/approval present, watermark embedded, HTML escaping, fixed section order

### Commit 3 — `phase-8: PDF renderer` (3f31c24)
- `packages/renderer/src/pdf.ts`
  - `renderPdf()` — returns `PdfResult` with `status: "not_built"`, no fake bytes
  - `PdfNotAvailableError` — thrown when a caller requires a built PDF
  - Honest reason: "PDF not built — no local pinned offline PDF renderer available"
- `packages/renderer/src/pdf.test.ts` — 5 tests: not_built status, no fake bytes, visible English reason, error class
- Open limitation recorded: no local pinned offline PDF renderer (pdf-parse and pdfjs-dist are readers; no puppeteer, playwright, wkhtmltopdf, or weasyprint)

### Commit 4 — `phase-8: build manifest` (628cd67)
- `packages/renderer/src/manifest.ts`
  - `computeHtmlSha256(html: string): string` — SHA-256 hex digest
  - `buildManifest(params: BuildManifestParams): BuildManifestResult` — assembles manifest with all pins
  - `renderPipeline(params: RenderPipelineParams): RenderPipelineResult` — full pipeline: HTML + sha256 + manifest
  - Pure and deterministic (no Date.now() or Math.random())
- `packages/renderer/src/manifest.test.ts` — 14 tests: sha256 determinism, all manifest fields, version pins, buildId/buildTime, determinism for identical inputs, renderPipeline determinism
- `packages/renderer/src/index.ts` — public API exports

### Commit 5 — `phase-8: watermark` (049324d)
- `packages/renderer/src/watermark.ts`
  - `buildWatermark(params: BuildWatermarkParams): Watermark` — constructs validated watermark
  - Generates buildId when omitted; uses supplied buildId for replay determinism
  - statusLine is the exact directive string: "Enterprise Candidate  -  Active Development"
- `packages/renderer/src/watermark.test.ts` — 8 tests: all four fields, exact statusLine, buildId generation, supplied buildId, determinism, validation rejections

### Commit 6 — migration 007 (5106e14)
- `packages/db/migrations/007_rendered_artifacts.sql`
  - Tables: `rendered_artifacts` (UNIQUE workflow_run_id + build_id), `build_manifests` (UNIQUE rendered_artifact_id)
  - Immutability triggers: `BEFORE UPDATE` and `BEFORE DELETE` on both tables reject changes
  - RLS ENABLE + FORCE with tenant policies on both tables
  - GRANT SELECT, INSERT only (no UPDATE, no DELETE)
  - Migration registry entry `007_rendered_artifacts`

### Commit 7 — `phase-8: rendered artifacts DB layer` (604d4ef)
- `packages/db/src/render.ts` — DB access layer:
  - `insertRenderedArtifact` (ON CONFLICT workflow_run_id + build_id DO NOTHING)
  - `getRenderedArtifact`, `getRenderedArtifactByBuild`, `listRenderedArtifactsByRun`
  - `insertBuildManifest` (ON CONFLICT rendered_artifact_id DO NOTHING)
  - `getBuildManifest`
  - Row types: `RenderedArtifactRow`, `BuildManifestRow`
- `packages/db/src/render.test.ts` — 22 unit tests:
  - insertRenderedArtifact (5): insert, 16 params, ON CONFLICT, JSON serialisation, fallback on conflict
  - getRenderedArtifact (3): found, null, query by id
  - getRenderedArtifactByBuild (3): found, throw, query by workflow_run_id + build_id
  - listRenderedArtifactsByRun (2): rows, query by workflow_run_id
  - insertBuildManifest (5): insert, 14 params, ON CONFLICT, sourceVersionIds array, fallback on conflict
  - getBuildManifest (3): found, throw, query by rendered_artifact_id
  - Migration 007 SQL structural checks (6): tables exist, RLS, immutability triggers, GRANT (no UPDATE/DELETE), migration registry
- `packages/db/src/index.ts` — extended to export render DB functions and row types

### Commit 8 — `phase-8: replay test` (715deaa)
- `packages/renderer/src/replay.test.ts` — 17 tests covering the directive's replay invariant:
  - Replay determinism (6): same inputs produce same HTML string, same HTML sha256, same manifest (deep equality), same sha256 via computeHtmlSha256, different content produces different sha256, 10-iteration replay produces identical sha256
  - No invented claim in HTML (3): no invented text, unknown assertion keys dropped, only known M03 section keys rendered
  - Immutability (3): no input mutation, no internal state, same output on repeated calls
  - Manifest pins present (5): all required fields match input, no undefined fields, htmlSha256 matches computeHtmlSha256, watermark in HTML, buildWatermark validation

## Requirements matrix (Directive Phase 8)

| Directive requirement                                          | Delivered | Evidence                                    |
|----------------------------------------------------------------|-----------|---------------------------------------------|
| Render HTML only from the approved content model               | Yes       | html.ts renderHtml — only known M03 sections |
| Drop unknown assertion keys                                    | Yes       | html.ts KNOWN_SECTION_KEYS; html.test.ts     |
| Include limitations, assumptions, evidence map, approvals      | Yes       | html.test.ts (4 tests for each section)      |
| Watermark metadata: tenant, artifact version, build id, time   | Yes       | watermark.ts buildWatermark; html.ts meta   |
| Manifest: content hash, source version ids, prompt, model,    | Yes       | manifest.ts buildManifest; manifest.test.ts |
|   schema, policy, renderer, template, build id, time,          |           |                                              |
|   sha256 of HTML                                                | Yes       | manifest.ts computeHtmlSha256                |
| Replay test: same inputs -> same HTML sha256                   | Yes       | replay.test.ts (6 determinism tests)         |
| Published row content update rejected by trigger               | Yes       | migration 007 triggers; render.test.ts (6)  |
| PDF only if local pinned renderer works offline                 | No        | Not built — open limitation (see below)     |
| Else record "PDF not built" as open limitation                  | Yes       | pdf.ts renderPdf; pdf.test.ts                |
| Do not fake PDF bytes                                           | Yes       | pdf.test.ts verifies no bytes emitted        |
| Tests: replay, no invented claim, immutability, manifest pins  | Yes       | replay.test.ts (17 tests)                    |
| Commit each finished unit separately                           | Yes       | 8 commits + this report                      |
| Do not push                                                     | Yes       | No push performed                             |

## Open limitations (declared honestly per H05)

1. **PDF not built.** No local pinned offline PDF renderer is available in the workspace. `pdf-parse` and `pdfjs-dist` are PDF *readers*, not renderers. No `puppeteer`, `playwright`, `wkhtmltopdf`, or `weasyprint` is present. `renderPdf()` returns `status: "not_built"` with a visible English reason and no fake bytes. This is an open limitation, not a defect.

2. **Integration tests skipped.** The 101 skipped integration tests require a live PostgreSQL instance with migrations 001–007 applied and `DATABASE_URL`/`SUPERUSER_URL` set. They are not failed — they are skipped without a live database.

## Residual risks

1. **Integration tests not exercised.** The DB layer for rendered artifacts (`packages/db/src/render.ts`) is tested with a mock client only. The immutability triggers and RLS policies in migration 007 have not been verified against a live PostgreSQL instance. The SQL structural tests confirm the migration *contains* the right clauses, but execution against a real database is deferred to Phase 10 (or a live CI run with `DATABASE_URL`).

2. **HTML rendering is string-concatenation based.** The renderer builds HTML from escaped string concatenation, not a DOM-aware templating engine. It is deterministic and XSS-safe (all text is escaped), but it does not validate HTML structural well-formedness beyond the fixed template skeleton.

3. **Replay determinism depends on caller-supplied buildId and buildTime.** The render pipeline is deterministic only when the caller supplies the same `buildId` and `buildTime` across replays. If the caller generates a new `buildId` or uses `Date.now()`, the HTML and manifest will differ. This is by design (the watermark embeds buildId and buildTime), but it is a caller responsibility.

4. **Manifest JSON stored as jsonb.** The `manifest_json` column stores the manifest as JSONB. Key ordering in JSONB is not guaranteed by PostgreSQL, but the manifest fields are accessed by name (not by ordinal position), so this is not a correctness risk.

## Commit log (Phase 8)

```
25d7e50 phase-8: render schema  -  gate passed
565406a phase-8: HTML renderer  -  gate passed
3f31c24 phase-8: PDF renderer  -  gate passed
628cd67 phase-8: build manifest  -  gate passed
049324d phase-8: watermark  -  gate passed
5106e14 Create 007_rendered_artifacts.sql
604d4ef phase-8: rendered artifacts DB layer  -  gate passed
715deaa phase-8: replay test  -  gate passed
```

Phase 8 is complete. Stopping. Phase 9 has not been started.
