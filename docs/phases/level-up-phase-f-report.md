# Level Up Phase F — Operator Truth Report

> **Enterprise Candidate — Active Development**
> No production claim is made.

## Phase directive

> PHASE F — OPERATOR TRUTH
> Public test home with raw results. Honest status page: what is live, what
> is not, last gate. Demo that also reads the open limits. Expert acceptance
> protocol with blank scores. Buyer security pack: threat model, closed
> checks, open checks. Light load note that states the actual user count,
> not a capacity claim. One real case study only with permission; otherwise
> write the blocker. Do not remove Candidate. Gate exit 0. Stop.
> Do not add Phase G.

## Gate results

| Check | Command | Exit |
|-------|---------|-----|
| Typecheck | `pnpm typecheck` | 0 |
| Test | `pnpm test` | 0 — 1043 passed, 103 skipped |
| Lint | `pnpm lint` | 0 |

All three exit 0. 103 tests are skipped (101 integration without live
PostgreSQL, 2 live-model without API key). A skipped test is not passed.

## Units delivered

### Unit 1 — Public test home with raw results
- **Commit:** `level-up-F: public test home with raw results - gate passed`
- **File:** `docs/testing/test-home.md` (rewritten)
- **Content:** Every test suite by package with exact test counts. Last gate
  run date and exit codes. Per-suite breakdown for all 4 packages (apps/api:
  90, packages/domain: 544+2 skipped, packages/db: 323+101 skipped,
  packages/renderer: 86). Stale "No PDF output" line replaced with honest "PDF
  is built" note (pdfkit@0.20.2, 13 tests). Live-model skip recorded (2 tests,
  no API key). Open limitations updated to match current state.

### Unit 2 — Honest status page + demo reads open limits
- **Commit:** `level-up-F: honest status page + demo reads open limits - gate passed`
- **Files:** `docs/testing/status-page.md` (new), `scripts/demo.sh` (updated)
- **Content:** Status page lists what is live (20 items with test evidence) and
  what is not live (6 items with blockers). Last gate recorded with date and
  exit codes. Demo script updated: stale "No PDF output — renderPdf() returns
  status: not_built" replaced with correct open limits (PDF is built, 2
  live-model tests skipped, 0 actual users, no regional DR).

### Unit 3 — Expert acceptance protocol (blank scores) + buyer security pack
- **Commit:** `level-up-F: expert acceptance protocol (blank scores) + buyer security pack - gate passed`
- **Files:** `docs/eval/expert-acceptance-protocol.md` (updated),
  `docs/security/buyer-security-pack.md` (new)
- **Content:** Expert acceptance protocol: stale "PDF not built" evaluation
  item replaced with "PDF emits real bytes (honestly)"; open limitations
  section updated (PDF is built, drill was run, no deployed service, 2
  live-model tests skipped). All scores remain blank (`__`). Buyer security
  pack: threat model summary (T01–T12, 5 threat actors), 12 closed checks
  (all unit-level, 1 structural — T07 audit trigger), 3 open check categories
  (no live integration, no live DB, no regional DR). No check closed without a
  recorded test.

### Unit 4 — Light load note (0 users) + case study blocker
- **Commit:** `level-up-F: light load note (0 users) + case study blocker - gate passed`
- **Files:** `docs/testing/light-load-note.md` (new), `docs/case-study.md` (new)
- **Content:** Light load note states actual user count: **0 real users**. No
  capacity, throughput, latency, or scalability claim. Test suite measures
  unit correctness, not load. Case study page records the blocker truthfully:
  no real customer, no permission, no case study can be written. The directive
  says "otherwise write the blocker" — the blocker is written.

## Requirements matrix

| Requirement | Delivered | Evidence |
|-------------|-----------|----------|
| Public test home with raw results | Yes | `docs/testing/test-home.md` — per-suite counts, last gate, 1043 passed / 103 skipped |
| Honest status page (what is live, what is not, last gate) | Yes | `docs/testing/status-page.md` — 20 live items, 6 not-live items, gate date + exits |
| Demo that also reads the open limits | Yes | `scripts/demo.sh` — prints status line + open limitations (PDF built, 2 live-model skipped, 0 users, no DR) |
| Expert acceptance protocol with blank scores | Yes | `docs/eval/expert-acceptance-protocol.md` — all scores `__`, stale items fixed, open limitations updated |
| Buyer security pack (threat model, closed checks, open checks) | Yes | `docs/security/buyer-security-pack.md` — 12 closed (unit), 3 open categories |
| Light load note (actual user count, not capacity) | Yes | `docs/testing/light-load-note.md` — 0 real users, no capacity claim |
| One real case study only with permission; otherwise write the blocker | Yes (blocker) | `docs/case-study.md` — no customer, no permission, blocker recorded |
| Do not remove Candidate | Yes | Status line stays "Enterprise Candidate — Active Development" in all new files |
| Gate exit 0 | Yes | typecheck 0, test 0, lint 0 |
| Stop. Do not add Phase G | Yes | No Phase G started |

## Residual risks

- **No deployed service.** The Render Blueprint defines the surface but has
  not been deployed. All "what is live" items are live in source and tests,
  not in a running production service.
- **No live integration tests.** 101 integration tests are skipped in the
  default environment. They were run once in CI (R1, 101 passed) but are not
  run by the default gate.
- **No live LLM.** 2 live-model tests are skipped (no API key). No real model
  call has been recorded.
- **0 real users.** The light load note states 0. No capacity claim is made.
- **No case study.** The blocker is recorded. No real customer or permission
  exists.
- **Security is unit-level.** All 12 closed checks use mock doubles. No live
  security test has been run against a deployed service.

## Commits (Phase F)

1. `e2f773d` — level-up-F: public test home with raw results - gate passed
2. `d748116` — level-up-F: honest status page + demo reads open limits - gate passed
3. `d9b52d6` — level-up-F: expert acceptance protocol (blank scores) + buyer security pack - gate passed
4. `96e07eb` — level-up-F: light load note (0 users) + case study blocker - gate passed
5. This report — level-up-F: report - gate passed

---

Status: Enterprise Candidate — Active Development. Phase F complete. No
Phase G. Gate passed. Stop.
