# Buyer Security Pack — AlinaMatrix Enterprise

> **Enterprise Candidate — Active Development**
> No production claim is made.

This document is the security pack for a buyer or operator evaluating
AlinaMatrix Enterprise. It lists the threat model, closed checks, and open
checks. A closed check has a recorded test that passed. An open check does
not. No check is closed without a recorded live result.

## Threat model

The full threat model is in `docs/security/threat-model-v0.md` (version 0.1,
2026-10-01). It covers twelve threats (T01–T12) across five threat actors:

1. Unauthenticated external attacker
2. Authenticated user in Tenant A (attempts to read Tenant B)
3. Malicious document uploader (prompt injection, bad MIME)
4. Compromised author (self-approval, finding suppression)
5. Insider with DB access (audit mutation)

## Closed checks

A closed check has a recorded unit test that passed in the last gate run.
Unit tests use mock doubles — not a live database or deployed service.

| # | Threat | Check | Status | Evidence |
|---|--------|-------|--------|----------|
| T01 | Authentication bypass | Login returns null for wrong password, unknown email, no membership; cookie flags verified | Closed (unit) | `apps/api/src/auth.test.ts` (22 tests) |
| T02 | Authorisation bypass | Tenant context set/clear; session resolution; membership-based isolation | Closed (unit) | `packages/db/src/rls.test.ts` (8 tests), `apps/api/src/auth.test.ts` |
| T03 | Tenant data breach | `setTenantContext` validates UUID, rejects SQL injection in tenant_id; cache key differs per tenant | Closed (unit) | `packages/db/src/rls.test.ts`, `packages/domain/src/agents.test.ts` (51 tests) |
| T04 | Path traversal | Object storage driver rejects keys containing `..` or absolute paths | Closed (unit) | `apps/api/src/storage.test.ts` (11 tests) |
| T05 | Prompt injection | Injected source text does not change plan; output does not contain "RELEASED" | Closed (unit) | `packages/db/src/injection.test.ts` (10 tests), `packages/domain/src/golden.test.ts` (9 tests) |
| T06 | Source immutability | Second write of same version bytes rejected; sha256 stored at upload | Closed (unit) | `packages/db/src/sources.test.ts` (19 tests) |
| T07 | Audit record mutation | DB trigger denies UPDATE/DELETE on audit_events; GRANT SELECT, INSERT only | Closed (structural) | `packages/db/src/audit.test.ts` (5 tests) |
| T08 | Self-approval (four-eyes) | Author cannot be sole release approver; enforced in review domain | Closed (unit) | `packages/domain/src/review.test.ts` (28 tests), `packages/domain/src/consensus.test.ts` (42 tests) |
| T09 | XSS in rendered HTML | Renderer uses allowlist of known content model keys; unknown keys dropped; all values escaped | Closed (unit) | `packages/renderer/src/replay.test.ts` (17 tests), `packages/renderer/src/html.test.ts` (19 tests) |
| T10 | SQL injection | Parameterised queries only; non-UUID tenant_id rejected before reaching DB | Closed (unit) | `packages/db/src/rls.test.ts` (8 tests) |
| T11 | Malicious MIME / oversized upload | MIME sniff + declared type check; size cap enforced; bad magic bytes → FAILED_TERMINAL | Closed (unit) | `apps/api/src/ingest.test.ts` (15 tests) |
| T12 | Secret leakage via logs | Logger redacts secret-shaped strings before output | Closed (unit) | `apps/api/src/logger.test.ts` (5 tests) |

## Open checks

An open check does not have a recorded live result. It is not closed.

| # | Threat | Check | Status | Blocker |
|---|--------|-------|--------|---------|
| T01–T12 | All threats | Live integration test against a deployed service | Open | No deployed service exists in this environment. R4 live security tests require a deployed Render service. The blocker is recorded in `docs/phases/release-4-report.md`. |
| T01–T12 | All threats | Live integration test against a real PostgreSQL instance | Open | 101 integration tests are skipped without `DATABASE_URL` and `SUPERUSER_URL`. They were run once in CI (R1, 101 passed) but are skipped in the default environment. |
| — | Regional disaster recovery | Cross-region replication, DR site, point-in-time recovery | Open | Not implemented. The backup drill passed against a local Docker container but no regional recovery is claimed. |

## Summary

- **12 threats** in the threat model (T01–T12).
- **12 closed checks** — all unit-level with mock doubles (1 structural: T07 audit trigger).
- **0 live checks closed** — no deployed service exists; no live integration test has been recorded against a deployed service in this environment.
- **101 integration tests** skipped (require live PostgreSQL).
- **2 live-model tests** skipped (require `OPENAI_API_KEY`).
- **0 real users** — no production deployment, no capacity claim.

No production claim is made. Do not deploy as a production system without
closing the open checks with recorded live results.

---

Status: Enterprise Candidate — Active Development.
