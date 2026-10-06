# Phase 4 Report — Claim Atoms and Provenance

Status: Enterprise Candidate — Active Development

## Gate commands and exit codes

| Command          | Exit code | Notes                                    |
|------------------|-----------|------------------------------------------|
| `pnpm typecheck` | 0         | All 6 packages clean                     |
| `pnpm test`      | 0         | See counts below (full live DB run)      |
| `pnpm lint`      | 0         | 0 errors, 0 warnings                     |

## Test counts (initial gate — no live DB)

| Package             | Passed | Failed | Skipped | Notes                                    |
|---------------------|--------|--------|---------|------------------------------------------|
| packages/domain     | 47     | 0      | 0       | Includes 35 Phase 4 claim domain tests   |
| packages/db         | 60     | 0      | 42      | Integration tests skipped (no live DB)   |
| apps/api            | 55     | 0      | 0       |                                          |
| **Total**           | **162**| **0**  | **42**  |                                          |

## Test counts (live PostgreSQL run — Phase 4 integration tests executed)

Run command:
```
DATABASE_URL=postgres://app_user:app_user_dev@localhost:5432/alinamatrix \
SUPERUSER_URL=postgres://alinamatrix:alinamatrix_dev@localhost:5432/alinamatrix \
  pnpm test
```
Migration 003 applied before run. GRANT for `app_user` on Phase 4 tables applied
(missing grants were the only failure; added to `003_claims_provenance.sql`).

| Package         | Test file                         | Passed | Failed | Skipped |
|-----------------|-----------------------------------|--------|--------|---------|
| packages/db     | audit.test.ts                     | 5      | 0      | 0       |
| packages/db     | rls.test.ts                       | 8      | 0      | 0       |
| packages/db     | sources.test.ts                   | 19     | 0      | 0       |
| packages/db     | claims.test.ts                    | 28     | 0      | 0       |
| packages/db     | rls.integration.test.ts           | 14     | 0      | 0       |
| packages/db     | sources.integration.test.ts       | 28     | 0      | 0       |
| packages/db     | claims.integration.test.ts (new)  | 35     | 0      | 0       |
| **packages/db** | **Total**                         | **137**| **0**  | **0**   |

Phase 4 live integration tests (35 total, previously 0):
- RLS live — claims (10 tests): SELECT isolation A↔B, INSERT WITH CHECK, getClaim, UPDATE, DELETE blocked
- RLS live — citations (5 tests): INSERT, cross-tenant SELECT, fail-closed, DELETE blocked, cross-tenant INSERT blocked
- RLS live — assumptions (4 tests): INSERT, cross-tenant SELECT, fail-closed, cross-tenant INSERT blocked
- RLS live — terminology_entries (8 tests): INSERT, SELECT, UNIQUE constraint, cross-tenant, fail-closed, same-term-different-project
- RLS live — claim_edges (8 tests): INSERT, getClaimEdges, cross-tenant SELECT, fail-closed, UNIQUE constraint, DELETE blocked, cross-tenant INSERT blocked

## Deliverables committed (6 separate commits)

1. **cc31619** `phase-4: claim schema migration (003_claims_provenance.sql)`
   - Tables: `claims`, `citations`, `assumptions`, `terminology_entries`, `claim_edges`
   - RLS policies on all tables; forward-only migration
   - CHECK constraints: `claim_type`, `support_status`, `citation_status`, `edge_type`

2. **45f91d3** `phase-4: domain logic — quote-lock, numeric reconciliation, terminology uniqueness, claim graph`
   - `validateQuoteLock`: substring + SHA-256 match; throws `QuoteLockError` on mismatch
   - `validateSupportStatus`: throws `MissingNegativeEvidenceError` when note absent
   - `detectUnitMismatch`: flags mismatched units; no auto-correction
   - `buildClaimGraph` / `traverseFrom`: adjacency map from `ClaimEdgeRow[]`

3. **6e0b0da** `phase-4: contracts — Zod schemas for claims, citations, assumptions, terminology, claim edges`
   - `CreateClaimRequest` / `ClaimResponse`
   - `CreateCitationRequest` / `CitationResponse` — no DOI/PMID field
   - `CreateAssumptionRequest` / `AssumptionResponse`
   - `CreateTerminologyEntryRequest` / `TerminologyEntryResponse`
   - `ClaimEdgeResponse`

4. **069053d** `phase-4: db access layer — insertClaim, getClaim, insertCitation, insertAssumption, upsertTerminologyEntry, insertClaimEdge`
   - All functions accept tenant_id server-side; no client-supplied tenant isolation authority
   - `upsertTerminologyEntry` uses `ON CONFLICT (project_id, term)` — DB-enforced uniqueness
   - `getClaimEdges` returns typed `ClaimEdgeRow[]` for graph traversal

5. **58f590b** `phase-4: tests — quote-lock, support-status invariant, tenant isolation, terminology uniqueness, numeric reconciliation, claim graph`
   - `packages/domain/src/claims.test.ts` — 35 tests covering all domain invariants
   - `packages/db/src/claims.test.ts` — 28 tests (mock-client, no live DB required)
   - `docs/phases/phase-4-plan.md`

6. **1b7aef0** `phase-4: live PostgreSQL integration tests for claims, citations, assumptions, terminology_entries, claim_edges — gate passed`
   - `packages/db/src/claims.integration.test.ts` — 35 live PostgreSQL tests
   - `packages/db/migrations/003_claims_provenance.sql` — added `GRANT` for `app_user` on Phase 4 tables (missing grants were the root cause of all 35 failures; fixed in migration file)

## Directive requirements satisfied

| Requirement                                       | Status  |
|---------------------------------------------------|---------|
| Tables: claims, citations, assumptions, terminology_entries | ✓ |
| claim_type witnessed\|inferred\|assumption        | ✓       |
| support_status supported\|weak\|unsupported\|conflicting\|not_applicable | ✓ |
| negative_evidence_note required when supported or inferred | ✓ |
| Citation status: discovered\|retrieved\|parsed\|supports_claim\|conflicts_with_claim\|unverified | ✓ |
| No API field for client-supplied DOI/PMID         | ✓       |
| Quote-lock: witnessed quote == fragment substring + hash | ✓  |
| Numeric reconciliation flags unit mismatch; no auto-correct | ✓ |
| Terminology unique per project                    | ✓       |
| Graph query over SUPPORTS/CONTRADICTS/DERIVED_FROM; no graph DB | ✓ |
| Test: quote-lock mismatch fails                   | ✓ (domain + live DB) |
| Test: unsupported cannot be stored as supported   | ✓ (domain + live DB) |
| Test: tenant isolation (cross-tenant returns null) | ✓ (live DB, all 5 tables) |

## Residual risks and open limitations

- **Quote-lock domain-only**: The `assertQuoteLock` function is tested against domain fixtures
  and live DB. It is not yet wired into an API endpoint (Phase 5+ concern). A caller could bypass
  it at the db-layer boundary; the RLS policy provides no DB-side quote check (application layer
  is the only enforcement point for quote integrity).
- **No LLM extraction**: Per directive, Phase 4 is out of scope for LLM-driven claim extraction.
  Claim atoms must be created via fixture or future API; no automated extraction exists.
- **Fixture importer not built**: Directive says "fixture importer allowed for tests". Tests use
  mock clients and DB-inserted fixtures; a reusable fixture-import script is deferred.
- **No production claim**: This system is Enterprise Candidate — Active Development.

## Out of scope (confirmed deferred)

- LLM extraction (Phase 5+)
- Agent runtime, jobs, workflows (Phase 5+)
- OCR, audio, web fetch, embeddings
