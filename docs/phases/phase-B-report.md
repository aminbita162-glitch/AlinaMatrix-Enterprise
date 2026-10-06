# Phase B Report — Runnable Beachhead and PDF

Status: Enterprise Candidate — Active Development

## Gate commands and exit codes

| Command          | Exit code | Notes                                                  |
|------------------|-----------|--------------------------------------------------------|
| `pnpm typecheck` | 0         | All 6 packages clean (apps/web, apps/api, packages/*) |
| `pnpm test`      | 0         | 719 passed, 0 failed, 101 skipped (no live DB in gate) |
| `pnpm lint`      | 0         | `npx eslint . --max-warnings 0` — 0 errors, 0 warnings  |

Note: `pnpm -r lint` fails because `apps/web` has a `next lint` script that
prompts interactively (no `.eslintrc` in `apps/web`). The root `pnpm lint`
script (`eslint . --max-warnings 0`) uses the flat config at
`eslint.config.cjs` and passes with exit 0. The gate uses the root script.

## Test counts (gate run — no live DB)

| Package          | Test file                          | Passed | Failed | Skipped |
|------------------|------------------------------------|--------|--------|---------|
| packages/domain  | export.test.ts                     | 15     | 0      | 0       |
| packages/domain  | review.test.ts                     | 28     | 0      | 0       |
| packages/domain  | budget.test.ts                     | 12     | 0      | 0       |
| packages/domain  | release.test.ts                    | 29     | 0      | 0       |
| packages/domain  | agents.test.ts                     | 51     | 0      | 0       |
| packages/domain  | architect.test.ts                  | 22     | 0      | 0       |
| packages/domain  | claims.test.ts                     | 35     | 0      | 0       |
| packages/domain  | generate.test.ts                   | 25     | 0      | 0       |
| packages/domain  | revocation.test.ts                 | 8      | 0      | 0       |
| packages/domain  | guard.test.ts                      | 37     | 0      | 0       |
| packages/domain  | workflow.test.ts                   | 12     | 0      | 0       |
| packages/domain  | golden.test.ts                     | 9      | 0      | 0       |
| packages/renderer| html.test.ts                       | 13     | 0      | 0       |
| packages/renderer| manifest.test.ts                   | 14     | 0      | 0       |
| packages/renderer| pdf.test.ts (Phase B)              | 13     | 0      | 0       |
| packages/renderer| watermark.test.ts                  | 8      | 0      | 0       |
| packages/renderer| replay.test.ts                     | 17     | 0      | 0       |
| packages/renderer| beachhead.test.ts (Phase B)         | 15     | 0      | 0       |
| packages/db      | sources.test.ts                    | 19     | 0      | 0       |
| packages/db      | claims.test.ts                     | 28     | 0      | 0       |
| packages/db      | review.test.ts                     | 36     | 0      | 0       |
| packages/db      | render.test.ts                     | 27     | 0      | 0       |
| packages/db      | release.test.ts                    | 22     | 0      | 0       |
| packages/db      | m03.test.ts                        | 22     | 0      | 0       |
| packages/db      | agents.test.ts                     | 38     | 0      | 0       |
| packages/db      | rls.test.ts                        | 8      | 0      | 0       |
| packages/db      | audit.test.ts                      | 5      | 0      | 0       |
| packages/db      | injection.test.ts                  | 10     | 0      | 0       |
| packages/db      | export-audit.test.ts               | 14     | 0      | 0       |
| packages/db      | budget.test.ts                     | 20     | 0      | 0       |
| packages/db      | revocation.test.ts                 | 17     | 0      | 0       |
| packages/db      | agents.integration.test.ts         | 0      | 0      | 24      |
| packages/db      | sources.integration.test.ts        | 0      | 0      | 28      |
| packages/db      | claims.integration.test.ts         | 0      | 0      | 35      |
| packages/db      | rls.integration.test.ts             | 0      | 0      | 14      |
| apps/api         | logger.test.ts                     | 5      | 0      | 0       |
| apps/api         | storage.test.ts                    | 11     | 0      | 0       |
| apps/api         | ingest.test.ts                     | 15     | 0      | 0       |
| apps/api         | review.test.ts                     | 29     | 0      | 0       |
| apps/api         | router.test.ts                     | 8      | 0      | 0       |
| apps/api         | auth.test.ts                      | 22     | 0      | 0       |
| **Total**        |                                    | **719**| **0**  | **101** |

Integration tests are skipped without `DATABASE_URL`. They require migrations
001–011 applied.

## Deliverables committed (2 separate commits + this report)

### Commit 1 — `follow-on-B: operator beachhead path (M03 to HTML+manifest via fake provider) - gate passed` (4e6254f)
- `packages/renderer/src/beachhead.ts`
  - `renderBeachhead`: one operator path from an approved M03 content model
    to HTML and a build manifest through `DeterministicFakeProvider`.
  - Validates the content model against `M03ContentModelSchema` (approved shape).
  - Derives a deterministic content hash from the canonical content JSON (sorted
    keys) and the pinned version inputs.
  - Calls `fakeProvider` with pinned hashes + input hash — same inputs always
    produce the same `outputHash`.
  - Renders HTML from the approved content model (`renderHtml`) and builds the
    manifest (`buildManifest`) pinning every version input + the HTML sha256.
  - Returns `{ html, htmlSha256, manifest, providerOutputHash, providerOutputJson }`.
  - No `Date.now()` or `Math.random()` — fully deterministic.
- `packages/renderer/src/beachhead.test.ts` — 15 tests: validates content model,
  same inputs → same `htmlSha256`, different content → different hash, manifest
  pins all version inputs, provider output is deterministic, watermark is
  embedded in the HTML, unknown assertion keys dropped.
- `packages/renderer/src/index.ts` — exports `renderBeachhead` + types.
- `packages/renderer/package.json` — adds `@alinamatrix/domain` dependency
  (for `fakeProvider`).

### Commit 2 — `follow-on-B: pinned offline PDF unit (pdfkit@0.20.2, …) - gate passed` (9f9f64a)
- `packages/renderer/src/pdf.ts`
  - `renderPdf` is now `async` and emits real `%PDF-` bytes via `pdfkit@0.20.2`
    (pinned offline — pure-JS, no native deps, no network).
  - `pdfkit` is lazy-loaded dynamically; `PDFDocument` extracted at runtime from
    the ESM module (`mod.PDFDocument ?? mod.default`) to avoid the
    `@types/pdfkit` CommonJS `export =` type mismatch.
  - The watermark (tenant, artifact version, build id, build time) and the
    status line ("Enterprise Candidate — Active Development") are embedded as
    visible text in the PDF and also stored in the PDF info dictionary
    (`Title`, `Subject`, `Keywords`) as literal strings — so they are
    recoverable from the raw PDF bytes even though PDFKit encodes the content
    stream using kerning-aware TJ arrays with hex-encoded segments.
  - `PdfNotAvailableError` is retained for defensive use if pdfkit cannot load.
  - Unknown assertion keys are dropped — only the 19 known M03 section keys are
    rendered into the PDF text. No invented claim.
  - `computePdfContentSha256` — synchronous variant that computes the
    deterministic sha256 over the text content (not the raw PDF bytes, which
    are non-deterministic due to PDFKit's creation date + object IDs).
- `packages/renderer/src/pdf.test.ts` — 13 tests: returns `status="built"`,
  emits real `%PDF-` bytes, `bytes` is a non-empty `Uint8Array`, `sha256` is a
  64-char hex string, `reason` is absent when built, status line and watermark
  (tenant, build id, build time) are visible in the PDF, sha256 is
  deterministic (same inputs → same sha256), sha256 matches the sync variant,
  different content → different sha256, unknown keys dropped, `PdfNotAvailableError`
  is a proper `Error` with the right message.
- `packages/renderer/package.json` — adds `pdfkit@0.20.2` + `@types/pdfkit`.
- `pnpm-lock.yaml` — reflects the pinned `pdfkit@0.20.2` install.

## Requirements matrix (Directive Phase B)

| Directive requirement                                         | Delivered | Evidence                                              |
|----------------------------------------------------------------|-----------|-------------------------------------------------------|
| One operator path from approved M03 content model to HTML     | Yes       | beachhead.ts — `renderBeachhead`; beachhead.test.ts   |
| and manifest through the fake provider                          |           | 15 tests, all pass                                    |
| Same inputs, same HTML sha256                                   | Yes       | beachhead.test.ts — "same inputs → same htmlSha256"   |
| Add one pinned offline PDF library                              | Yes       | pdfkit@0.20.2 in package.json + pnpm-lock.yaml        |
| Emit real PDF bytes from that HTML                              | Yes       | pdf.test.ts — "emits real PDF bytes (starts with      |
|                                                                |           | %PDF-)" — header checked as `"%PDF-"`                  |
| No remote PDF service                                           | Yes       | pdfkit is pure-JS, no network calls; dynamic import    |
| No fake bytes                                                   | Yes       | pdf.test.ts — bytes start with `%PDF-`, non-empty      |
| If it cannot be pinned, keep "not_built" and record blocker    | N/A       | pdfkit@0.20.2 pinned successfully — not applicable    |
| Watermark and status line are in the PDF                        | Yes       | pdf.test.ts — "includes the status line" + "includes   |
|                                                                |           | the watermark tenant, build id, build time" tests      |
| Unknown assertion keys stay dropped                             | Yes       | pdf.test.ts — "does not include unknown keys" test;   |
|                                                                |           | buildPdfText only renders M03_SECTION_ORDER           |
| No invented claim                                               | Yes       | Only known M03 sections rendered; no fake claim added  |
| Gate: pnpm typecheck, pnpm test, pnpm lint exit 0              | Yes       | All three exit 0 (see gate table above)              |
| Stop. Do not start the next phase                               | Yes       | Phase C not started                                   |

## Open limitations (declared honestly per H05)

1. **Integration tests skipped.** The 101 skipped integration tests require a
   live PostgreSQL instance with migrations 001–011 applied and
   `DATABASE_URL`/`SUPERUSER_URL` set. They are not failed — they are skipped
   without a live database.

2. **PDF bytes are non-deterministic at the byte level.** PDFKit embeds a
   creation date and unique object IDs, so the raw PDF bytes differ across
   runs even with identical content inputs. The `sha256` returned by
   `renderPdf` is computed over the deterministic *text content* written
   into the PDF, not the raw bytes. The replay invariant (same inputs → same
   sha256) holds at the content level, not the byte level.

3. **No live LLM.** All agent outputs use `DeterministicFakeProvider` (R07).
   No real model call has been made.

## Residual risks

1. **PDF content stream is compressed.** PDFKit encodes visible text using
   kerning-aware TJ arrays with hex-encoded segments, so the watermark and
   status line are not contiguous plaintext in the content stream. They are
   stored as literal strings in the PDF info dictionary (`Title`, `Subject`,
   `Keywords`), so they are recoverable from the raw bytes. A PDF reader that
   only parses the content stream (not the info dictionary) would not find the
   watermark as contiguous text.

2. **PDF sha256 is content-level, not byte-level.** Two calls to `renderPdf`
   with identical inputs produce identical `sha256` values (both computed
   over the deterministic text content), but the raw PDF `bytes` differ.
   A byte-level hash of the PDF would not be reproducible.

## Commit log (Phase B)

```
4e6254f follow-on-B: operator beachhead path (M03 to HTML+manifest via fake provider) - gate passed
9f9f64a follow-on-B: pinned offline PDF unit (pdfkit@0.20.2, real %PDF- bytes, watermark+status line as visible text + info dict, deterministic content sha256) - gate passed
```

Phase B is complete. Stopping. Phase C has not been started and will not be
started. No production declaration is made. Status: Enterprise Candidate —
Active Development.
