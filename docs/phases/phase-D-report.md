# Phase D — Provenance and Trace — Report

**Status line:** Enterprise Candidate — Active Development

**Directive text (Phase D):**

> Merkle provenance ledger over source version, content hash, manifest,
> and html sha256. Artifact time-travel diff between two stored builds.
> Code-to-document trace from a cited path to the claim and the rendered
> section. Append-only. Tenant isolated. Tests for tamper detection,
> deterministic diff, and missing-trace rejection. Gate exit 0. Stop.

---

## Gate commands and exit codes

| Command         | Exit code |
|-----------------|-----------|
| `pnpm typecheck`| 0         |
| `pnpm test`     | 0         |
| `pnpm lint`      | 0         |

All three exit 0 before each commit. No push.

---

## Test counts

| Package              | Test files          | Tests                         |
|----------------------|---------------------|-------------------------------|
| `packages/contracts` | — (no test script)  | —                             |
| `packages/domain`    | 15 passed           | 334 passed                    |
| `packages/db`        | 15 passed, 4 skipped | 302 passed, 101 skipped        |
| `packages/renderer`  | 6 passed            | 80 passed                     |
| `apps/api`          | 6 passed            | 90 passed                     |

Phase D added tests (all new files, all pass):

| File                                    | New tests |
|-----------------------------------------|----------|
| `packages/domain/src/provenance.test.ts`| 24       |
| `packages/db/src/provenance.test.ts`     | 18       |
| `packages/domain/src/timetravel.test.ts` | 15       |
| `packages/domain/src/trace.test.ts`      | 12       |
| `packages/db/src/trace.test.ts`          | 18       |
| **Total new Phase D tests**             | **87**   |

Integration tests (`.integration.test.ts`) remain skipped without
`DATABASE_URL` + `SUPERUSER_URL` — a skipped test is not passed, and not
failed.

---

## Commits (per-unit, in order)

| Hash      | Unit                              | Message                                                                                          |
|-----------|-----------------------------------|--------------------------------------------------------------------------------------------------|
| `b4167a1` | Merkle provenance ledger          | `follow-on-D: Merkle provenance ledger (source version, content hash, manifest, html sha256) - append-only, tenant isolated, tamper detection - gate passed` |
| `f39721e` | Artifact time-travel diff         | `follow-on-D: artifact time-travel diff between two stored builds (deterministic diffHash, source version id set diff) - gate passed` |
| `d243063` | Code-to-document trace            | `follow-on-D: code-to-document trace (cited path to claim and rendered section) - append-only, tenant isolated, missing-trace rejection - gate passed` |

This report is the final Phase D commit.

---

## Deliverables

### Unit 1 — Merkle provenance ledger

- `packages/contracts/src/provenance.ts` — `ProvenanceLeafSchema`,
  `ProvenanceLedgerEntrySchema`. Leaf pins the four fields: source version
  id, content hash, manifest sha256, html sha256.
- `packages/domain/src/provenance.ts` — `computeLeafHash` (canonical,
  sorted-keys JSON → SHA-256), `computeMerkleRoot` (sorted leaves, odd-node
  duplication, SHA-256 fold), `computeManifestSha256` (canonical manifest
  hash), `buildProvenanceLedgerEntry` (leaf + leaf hash + Merkle root +
  1-based sequence), `verifyProvenanceLedger` (re-fold + compare root —
  tamper detection), `ProvenanceLedgerError`.
- `packages/db/src/provenance.ts` — `provenance_ledger` table access:
  `insertProvenanceLedgerEntry`, `listProvenanceLedgerByArtifact`,
  `getProvenanceLedgerRoot` (latest sequence). Append-only (INSERT only).
- `packages/db/migrations/012_provenance_ledger.sql` — table, immutability
  triggers (no UPDATE, no DELETE), RLS (tenant isolated), GRANT (INSERT
  only), registry.

### Unit 2 — Artifact time-travel diff

- `packages/domain/src/timetravel.ts` — `diffArtifacts(before, after)`
  compares two `BuildSnapshot` values field-by-field: html sha256, content
  hash, manifest sha256, source version ids (set difference — added /
  removed), build time. Returns `DiffResult` with `identical`, `entries`
  (named `changed` / `added` / `removed` per field), and a deterministic
  `diffHash` (canonical JSON → SHA-256). Pure — no `Date.now()` or
  `Math.random()`.

### Unit 3 — Code-to-document trace

- `packages/contracts/src/trace.ts` — `TraceRecordSchema` (cited path,
  claim id, artifact id, section, tenant id).
- `packages/domain/src/trace.ts` — `buildTraceRecord` (validate + assemble),
  `findTrace` (pure lookup), `assertTraceExists` (missing-trace rejection —
  throws `MissingTraceError` when no trace links a cited path to a claim).
- `packages/db/src/trace.ts` — `code_to_document_traces` table access:
  `insertTrace`, `listTracesByClaim`, `listTracesByArtifact`,
  `findTraceByPathAndClaim`. Append-only (INSERT only).
- `packages/db/migrations/013_code_to_document_traces.sql` — table,
  immutability triggers, RLS (tenant isolated), GRANT (INSERT only),
  registry.

---

## Requirements matrix

| Directive requirement                                       | Delivered by                          |
|-------------------------------------------------------------|---------------------------------------|
| Merkle provenance ledger over source version                | `provenance.ts` + migration 012       |
| Merkle ledger over content hash                            | `provenance.ts` (leaf field)           |
| Merkle ledger over manifest                                 | `provenance.ts` (leaf field)           |
| Merkle ledger over html sha256                             | `provenance.ts` (leaf field)           |
| Artifact time-travel diff between two stored builds        | `timetravel.ts`                         |
| Code-to-document trace from cited path to claim + section  | `trace.ts` + migration 013             |
| Append-only                                                 | migrations 012 + 013 immutability triggers, INSERT-only GRANT |
| Tenant isolated                                             | migrations 012 + 013 RLS policies      |
| Tests for tamper detection                                  | `provenance.test.ts` (verifyProvenanceLedger) |
| Tests for deterministic diff                                | `timetravel.test.ts` (diffHash determinism) |
| Tests for missing-trace rejection                           | `trace.test.ts` (assertTraceExists)    |
| Gate exit 0                                                  | typecheck, test, lint all 0             |
| Stop at phase gate                                          | No Phase E work started                 |

---

## Residual risks

- The Merkle root is computed by the domain layer and stored as a column;
  the DB does not recompute it. A future integration test (with
  `DATABASE_URL`) should round-trip the ledger through the real DB to
  confirm the root survives the insert + read path. That test is skipped
  without a database and is not failed.
- `diffArtifacts` compares snapshots, not live `rendered_artifacts` rows.
  The caller is responsible for building the `BuildSnapshot` from a stored
  build. The snapshot type is exported so the API layer can assemble it.
- `findTraceByPathAndClaim` is case-sensitive on `cited_path`. Two traces
  that differ only by case are distinct rows. This is the intended behaviour
  (file paths are case-sensitive on the host).
- No live LLM is called. No secrets, raw documents, or full prompts are
  logged. No client-supplied `tenant_id` is accepted as the isolation
  authority — the tenant id is server-derived from the session membership
  and passed into the DB layer as the second parameter.

---

## Status line

Enterprise Candidate — Active Development
