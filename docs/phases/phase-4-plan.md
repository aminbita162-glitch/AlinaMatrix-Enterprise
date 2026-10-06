# Phase 4 Plan — Claim Atoms and Provenance

Status: Enterprise Candidate — Active Development

## In-scope items

### 1. Database migration — 003_claims_provenance.sql
New tables:
- **claims** — claim atoms with subject, predicate, object, qualifier, time_scope, unit, claim_text,
  claim_type (witnessed|inferred|assumption), support_status (supported|weak|unsupported|conflicting|not_applicable),
  negative_evidence_note (required when support_status is supported or inferred),
  evidence_ids (uuid[]), confidence (numeric 0–1), contradiction_status, generated (bool), reviewer_status.
- **citations** — link evidence to claims; status: discovered|retrieved|parsed|supports_claim|conflicts_with_claim|unverified.
  No API field that allows a client to supply DOI/PMID.
- **assumptions** — standalone assumption rows linked to claims or projects.
- **terminology_entries** — per-project term/definition pairs; unique per project.
- **claim_edges** — provenance graph: SUPPORTS, CONTRADICTS, DERIVED_FROM relationships between claims.
  No external graph database; plain SQL with an edge_type check constraint.

RLS on all new tables. Forward-only migration.

### 2. Domain logic — packages/domain/src/claims.ts
- **Quote-lock**: witnessed claim's quote must be an exact substring of the named fragment's text,
  and the provided hash must equal `computeSha256String(quote)`. Mismatch throws `QuoteLockError`.
- **Numeric reconciliation**: if two claims reference the same subject/predicate but different units,
  flag `unit_mismatch: true`. No auto-correction.
- **Terminology uniqueness**: enforce unique term per project (DB UNIQUE constraint + domain guard).
- **Support-status invariant**: `negative_evidence_note` is required when `support_status` is
  `supported` or `inferred`. Attempting to store without it throws `MissingNegativeEvidenceError`.
- **Claim graph helpers**: buildClaimGraph(edges) → adjacency map; traverseFrom(claimId).

### 3. Contracts — packages/contracts/src/claims.ts
Zod schemas for:
- CreateClaimRequest / ClaimResponse
- CreateCitationRequest / CitationResponse
- CreateAssumptionRequest / AssumptionResponse
- CreateTerminologyEntryRequest / TerminologyEntryResponse
- ClaimEdgeResponse

No DOI/PMID field exposed.

### 4. DB access layer — packages/db/src/claims.ts
Functions:
- insertClaim / getClaim / listClaimsByProject
- insertCitation / getCitation
- insertAssumption / listAssumptions
- upsertTerminologyEntry / getTerminologyEntry / listTerminology
- insertClaimEdge / getClaimEdges

### 5. Tests — packages/db/src/claims.test.ts + packages/domain/src/claims.test.ts
Required by directive:
- quote-lock mismatch fails
- unsupported claim cannot be stored as supported
- tenant isolation (cross-tenant returns null)
- terminology uniqueness constraint
- numeric reconciliation unit mismatch detection
- claim graph traversal

## Out of scope
- LLM extraction (Phase 5+)
- Agent runtime, jobs, workflows
- OCR, audio, web fetch, embeddings

## Gate
```
pnpm typecheck
pnpm test
pnpm lint
```
All must exit 0.

## Commit strategy (separate commits per unit)
1. claim schema (migration + row types)
2. quote-lock (domain logic)
3. numeric reconciliation (domain logic)
4. terminology lock (domain + db)
5. tests
