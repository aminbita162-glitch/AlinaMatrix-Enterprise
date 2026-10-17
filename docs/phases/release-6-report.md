# Release R6 — README Truth — Gate Report

Status: Enterprise Candidate — Active Development.

## Directive

R6 — README Truth. Remove the stale "PDF not built" lines. Claims audit must
match `packages/renderer/src/pdf.ts`. Add a short English lead box at the top:
what the system is, what it does, what problem it solves, current scale, and
open limits. About 30–40 seconds to read. Status line stays exact. No
production claim. Gate exit 0. Stop. Do not add R7.

## Gate commands and exit codes

```
pnpm typecheck   # exit 0
pnpm test        # exit 0
pnpm lint        # exit 0
```

All three exited 0.

## Test counts

| Package | Tests | Passed | Skipped |
|---|---|---|---|
| apps/api | 90 | 90 | 0 |
| packages/domain | 441 | 439 | 2 (live-model, no API key) |
| packages/db | 424 | 323 | 101 (integration, no live DB) |
| packages/renderer | 86 | 86 | 0 |
| apps/web | 0 | — | — (no web tests) |
| packages/contracts | 0 | — | — (no contracts tests) |

938 unit tests passed. 103 skipped (101 integration + 2 live-model). 0 failed.

## Deliverables

1. **Lead box added** at the top of `README.md` (after the honesty header,
   before the animated SVG). Five labelled paragraphs:
   - **What it is** — stack (TS strict + Next.js + Node HTTP + pnpm,
     PostgreSQL 16 + RLS, no Express).
   - **What it does** — four-agent pipeline (AlinaArchitect, AlinaGuard,
     AlinaDocEngine, AlinaOptimizer) from source to auditable artifact.
   - **What problem it solves** — structured synthesis with provenance,
     tenant isolation, controlled review — not freeform LLM output.
   - **Current scale** — M03 beachhead only; 938 unit tests; 101 integration
     tests skipped; PinnedModelProvider deterministic; LiveModelProvider 2
     skipped; backup drill passed (R5); Render Blueprint is a candidate.
   - **Open limits** — no live LLM, unit-level security, no DR, local
     storage only, M03 only.
2. **Stale "PDF not built" lines removed.** The Known Limitations entry
   "No PDF output" (3 lines claiming `renderPdf()` returns
   `status: "not_built"`) was deleted. Phase B upgraded `pdf.ts` to emit
   real `%PDF-` bytes via `pdfkit@0.20.2`; the README no longer claims
   otherwise.
3. **Claims audit row updated** to match `packages/renderer/src/pdf.ts`:
   `renderPdf()` returns `status: "built"`, bytes start with `%PDF-`, sha256
   is computed over the deterministic text content. Evidence: `pdf.ts:240`
   (`export async function renderPdf`), `pdf.ts:304` (returns `status:
   "built"`), `pdf.test.ts` (13 tests).
4. **Honesty lines preserved.** Both lines added in R4
   ("Candidate stays until real deployment and real use." /
   "A small test count is not proof of real-world capacity.") are intact.
5. **Status line stays exact.** "Enterprise Candidate — Active Development"
   appears in the header, lead box, Status section, and footer. No
   production claim. Candidate stays.

## Requirements matrix

| Requirement (R6) | Status | Evidence |
|---|---|---|
| Remove stale "PDF not built" lines | Done | `README.md` — "No PDF output" block deleted; `grep -c "PDF not built\|not_built\|No PDF output" README.md` returns 0 |
| Claims audit matches `packages/renderer/src/pdf.ts` | Done | Claims audit row: "PDF built (real bytes)" — `renderPdf()` returns `status: "built"`, bytes start with `%PDF-`, sha256 over deterministic text content. Matches `pdf.ts:240,304` |
| Lead box at top (what/does/problem/scale/limits) | Done | `README.md` lines 9–37 — five labelled paragraphs |
| About 30–40 seconds to read | Done | ~250 words, five short paragraphs |
| Status line stays exact | Done | "Enterprise Candidate — Active Development" in header, lead box, Status section, footer |
| No production claim | Done | "No production claim is made." in header; no "production" claim anywhere |
| Keep Candidate | Done | "Candidate" appears 6 times; "Enterprise Candidate" in header + Status + footer |
| Keep both honesty lines | Done | Lines 5–6: "Candidate stays until real deployment and real use." / "A small test count is not proof of real-world capacity." |
| Gate exit 0 | Done | typecheck 0, test 0, lint 0 |

## Residual risks

- No new code was added; only `README.md` was modified. No tests, no
  migrations, no source files changed.
- The lead box cites 938 unit tests and 101 skipped integration tests —
  these counts are accurate as of this gate run.
- The claims audit cites `pdf.ts` which emits real bytes — verified by
  `packages/renderer/src/pdf.test.ts` (13 tests, all passed).

No production claim is made. Do not deploy as a production system.
Render candidate — not production.
