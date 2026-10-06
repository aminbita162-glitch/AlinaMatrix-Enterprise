# Phase 4 Report — Claim Atoms and Provenance

Status: Enterprise Candidate — Active Development

## Gate commands and exit codes

| Command          | Exit code | Notes                        |
|------------------|-----------|------------------------------|
| `pnpm typecheck` | 0         | All 6 packages clean         |
| `pnpm test`      | 0         | See counts below             |
| `pnpm lint`      | 0         | 0 errors, 0 warnings         |

## Test counts

| Package             | Passed | Failed | Skipped | Notes                                    |
|---------------------|--------|--------|---------|------------------------------------------|
| packages/domain     | 47     | 0      | 0       | Includes 35 Phase 4 claim domain tests   |
| packages/db         | 60     | 0      | 42      | Integration tests skipped (no live DB)   |
| apps/api            | 55     | 0      | 0       |                                          |
| **Total**           | **162**| **0**  | **42**  |                                          |

All skipped tests are integration tests gated behind `INTEGRATION_TEST=true` / live
PostgreSQL. They are not failures; no live database is available in this environment.

## Deliverables committed (5 separate commits)

1. **cc31619** `phase-4: claim schema migration (003_claims_provenance.sql)`
   - Tables: `claims`, `citations`, `assumptions`, `terminology_entries`, `claim_edges`
   - RLS policies on all tables; forward-only migration
   - CHECK constraints: `claim_type`, `support_status`, `citation_status`, `edge_type`
   - Trigger: `enforce_negative_evidence_note` blocks `supported`/`inferred` without note

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
| Test: quote-lock mismatch fails                   | ✓       |
| Test: unsupported cannot be stored as supported   | ✓       |
| Test: tenant isolation (cross-tenant returns null) | ✓      |

## Residual risks and open limitations

- **Integration tests skipped**: All 42 integration tests require a live PostgreSQL instance.
  The RLS trigger (`enforce_negative_evidence_note`) and `ON CONFLICT` uniqueness are exercised
  only in integration tests. They cannot be declared passing until the DB is available.
- **Quote-lock domain-only**: The `validateQuoteLock` function is tested against domain fixtures.
  It is not yet wired into an API endpoint (Phase 5+ concern). A caller could bypass it at the
  db-layer boundary; the trigger provides the DB-side backstop.
- **No LLM extraction**: Per directive, Phase 4 is out of scope for LLM-driven claim extraction.
  Claim atoms must be created via fixture or future API; no automated extraction exists.
- **Fixture importer not built**: Directive says "fixture importer allowed for tests". Tests use
  mock clients; a real fixture-import script is deferred.
- **No production claim**: This system is Enterprise Candidate — Active Development.

## Out of scope (confirmed deferred)

- LLM extraction (Phase 5+)
- Agent runtime, jobs, workflows (Phase 5+)
- OCR, audio, web fetch, embeddings
