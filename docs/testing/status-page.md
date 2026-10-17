# Status Page — AlinaMatrix Enterprise

> **Enterprise Candidate — Active Development**
> No production claim is made.

This page states honestly what is live, what is not, and the last gate result.
It is the operator's truth page — no capacity claim, no invented number.

## What is live

| Item | Status | Evidence |
|------|--------|----------|
| HTML renderer | Live | `packages/renderer/src/html.ts` — 19 tests pass; HTML rendered from approved M03 content model |
| PDF renderer | Live | `packages/renderer/src/pdf.ts` — 13 tests pass; `renderPdf()` emits real `%PDF-` bytes via pdfkit@0.20.2 |
| M03 beachhead path | Live (deterministic) | `packages/renderer/src/beachhead.ts` — 15 tests pass; operator path via `DeterministicFakeProvider` |
| Release gate | Live | `packages/domain/src/release.ts` — 29 tests pass; validations, four-eyes, manifest, checksum, version pins |
| Budget breaker | Live | `packages/domain/src/budget.ts` — 12 tests pass; over budget does not call provider |
| Revocation | Live | `packages/domain/src/revocation.ts` — 8 tests pass; append-only event |
| Export + watermark | Live | `packages/domain/src/export.ts` — 15 tests pass; watermark intact checks all four meta tags |
| Consensus review | Live | `packages/domain/src/consensus.ts` — 42 tests pass; deadline, threshold, no self-approval |
| Template-driven rendering | Live | `packages/domain/src/template.ts` — 19 tests pass; `M03_DEFAULT_TEMPLATE` + schema intersection |
| Provenance (Merkle) | Live | `packages/domain/src/provenance.ts` — 24 tests pass; leaf pins source + content + manifest + HTML |
| Time-travel diff | Live | `packages/domain/src/timetravel.ts` — 15 tests pass; deterministic `diffHash` |
| Assumption register | Live | `packages/domain/src/assumption-register.ts` — 21 tests pass; source, owner, expiry enforced |
| Quote-lock release gate | Live | `packages/domain/src/quote-lock-release.ts` — 13 tests pass; no RELEASED without valid quote |
| Numeric reconciliation | Live | `packages/domain/src/numeric-reconciliation.ts` — 19 tests pass; differences recorded, not corrected |
| Negative evidence | Live | `packages/domain/src/negative-evidence.ts` — 22 tests pass; silence is a violation |
| Reviewer diff | Live | `packages/domain/src/reviewer-diff.test.ts` — 16 tests pass; diff between two builds |
| Pinned model provider | Live (deterministic) | `packages/domain/src/pinned-model.ts` — 39 tests pass; output hash differs from fake provider |
| API server | Live | `apps/api/src/server.ts` — 90 tests pass; Node HTTP, migrations before serve |
| DB migrations 001–014 | Live | `packages/db/migrations/` — 323 tests pass; append-only, RLS, immutability triggers |
| Render Blueprint | Live (blueprint) | `render.yaml` — defines web + api + PostgreSQL 16; not deployed here |

## What is not live

| Item | Status | Blocker |
|------|--------|---------|
| Deployed service | Not live | No Render account or live PostgreSQL instance in this environment. The blueprint (`render.yaml`) defines the surface but has not been deployed. |
| Live LLM call | Not live | `LiveModelProvider` is implemented; 2 live-call tests are skipped (no `OPENAI_API_KEY`). No real model call has been recorded. |
| Integration tests | Not live | 101 integration tests are skipped — they require a live PostgreSQL instance with `DATABASE_URL` and `SUPERUSER_URL`. Skipped, not failed, not passed. |
| Live security tests | Not live | R4 security tests require a deployed service. No deployed service exists in this environment. The blocker is recorded in `docs/phases/release-4-report.md`. |
| Regional disaster recovery | Not live | No DR site, no cross-region replication, no point-in-time recovery. The backup drill passed against a local Docker container but no regional recovery is claimed. |
| Real users | Not live | Actual user count: 0. No real users have used the system. This is not a capacity claim. |

## Last gate

| Check | Command | Exit | Result |
|-------|---------|------|--------|
| Typecheck | `pnpm typecheck` | 0 | 6 of 7 workspace projects, all pass |
| Test | `pnpm test` | 0 | 1043 passed, 103 skipped |
| Lint | `pnpm lint` | 0 | `eslint . --max-warnings 0`, 0 warnings |

**Gate date:** 2026-10-17
**Gate status:** Green (exit 0 on all three). 103 tests are skipped — a skipped
test is not passed.

## Honest summary

The system is a Candidate. The HTML and PDF renderers emit real bytes. The
release gate, budget breaker, revocation, export, consensus, provenance, and
evidence-depth modules are implemented and unit-tested. The M03 beachhead is
deterministic but not proven against a live database. No live LLM call has
been recorded. No deployed service exists. No real users have used the system.
No regional disaster recovery is claimed. The status line stays exact:
**Enterprise Candidate — Active Development**.

---

Status: Enterprise Candidate — Active Development.
