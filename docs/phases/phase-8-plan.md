# Phase 8 Plan — Renderer and Build Manifest

Status: Enterprise Candidate — Active Development

## In-scope items (from DIRECTIV.txt Phase 8)

1. Render HTML only from the approved content model. Drop unknown assertion keys.
2. Include limitations, assumptions, evidence map, approvals.
3. Watermark metadata: tenant, artifact version, build id, time.
4. Manifest: content hash, source version ids, prompt, model, schema, policy,
   renderer, template, build id, time, sha256 of HTML.
5. Replay test: same inputs -> same HTML sha256.
6. Published row content update rejected by trigger.
7. PDF only if a local pinned renderer works offline without a new network
   install. Else record "PDF not built" as an open limitation. Do not fake
   PDF bytes.
8. Tests: replay, no invented claim in HTML, immutability, manifest pins
   present.

## Commit order (one commit per finished unit)

1. `phase-8: render schema  -  gate passed` — Zod contracts for
   `RenderManifestSchema`, `WatermarkSchema`, `RenderInputSchema`,
   `RenderResultSchema`; exported from `packages/contracts/src/render.ts`
   and re-exported from `packages/contracts/src/index.ts`.
2. `phase-8: HTML renderer  -  gate passed` — `packages/renderer/src/html.ts`:
   `renderHtml(content, watermark)` — deterministic HTML string from the M03
   content model. Drops unknown assertion keys (only known M03 sections
   rendered). Includes limitations, assumptions, evidence map, approvals.
3. `phase-8: PDF renderer  -  gate passed` — `packages/renderer/src/pdf.ts`:
   `renderPdf(content, watermark)` — records "PDF not built" honestly.
   No local pinned offline PDF renderer is available (pdf-parse/pdfjs-dist are
   readers; no puppeteer/playwright/wkhtmltopdf present). The function throws
   `PdfNotAvailableError` so callers record the limitation; no fake bytes.
4. `phase-8: build manifest  -  gate passed` —
   `packages/renderer/src/manifest.ts`: `buildManifest(renderInput, html)` —
   assembles the manifest with content hash, source version ids, version pins
   (prompt, model, schema, policy), renderer, template, build id, time, and
   sha256 of HTML. Pure and deterministic.
5. `phase-8: watermark  -  gate passed` — `packages/renderer/src/watermark.ts`:
   `buildWatermark(params)` — deterministic watermark metadata block
   (tenant, artifact version, build id, time). Embedded in HTML as a
   `<meta>` block.
6. `phase-8: replay test  -  gate passed` — `packages/renderer/src/replay.test.ts`
   and section tests covering: replay determinism (same inputs -> same HTML
   sha256), no invented claim in HTML, immutability guard (published content
   update rejected), manifest pins present.

## Out of scope (Phase 8 only)

- Phase 9: release gate, export, budget breaker, revocation.
- Phase 10: golden fixtures, scorecard, backup runbook.
- Live LLM calls (R07 — DeterministicFakeProvider only).

## Gate

```
pnpm typecheck
pnpm test
pnpm lint
```

All must exit 0.

## Open limitation (declared honestly)

PDF is not built: no local pinned offline PDF renderer is available in the
workspace (pdf-parse and pdfjs-dist are PDF *readers*; no puppeteer,
playwright, wkhtmltopdf, or weasyprint). Per DIRECTIV.txt Phase 8, this is
recorded as an open limitation, not faked.
