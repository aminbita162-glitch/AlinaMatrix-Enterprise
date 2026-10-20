# ECIDR Capability Reconciliation Matrix

**Directive:** ECIDR v1.0 — Verifiable Evidence Context Integrity & Deterministic Replay  
**Date:** 2026-10-20  
**Baseline SHA:** `87149b23a9461fe2e90393f3b4596ff227e98e84`  
**Branch:** main  

## Reconciliation Results

| § | Requirement | Existing Implementation | State | Action |
|---|-------------|------------------------|-------|--------|
| 04 | Context handoff bound to authenticated tenant, project, run, job, agent, task, policy, source versions | `agents.ts` capability checks; `tenant-context.ts` RLS; `architect.ts`/`guard.ts`/`generate.ts` accept tenantId/projectId/workflowRunId/pins | PARTIAL | Build unified ContextContractV1 that binds all fields; integrate at agent call sites |
| 05 | Context Contract V1 — strict runtime-validated, versioned logical schema | No existing context contract schema | MISSING | Create `packages/contracts/src/context.ts` with ContextContractV1Schema |
| 06 | Canonicalization and hashing — domain-separated SHA-256, stable key ordering, explicit versions | `computeSha256`, `computeSha256String`, `buildCacheKey`, `computeLeafHash`, `sortKeys` all exist | PARTIAL | Reuse existing sortKeys/SHA-256; add `computeContextPayloadSha256` and `computeSnapshotSha256` |
| 07 | Immutable snapshot lifecycle PREPARED → SEALED → CONSUMED/REJECTED | No existing snapshot lifecycle | MISSING | Create state machine in `packages/domain/src/context.ts` |
| 08 | DB transaction safety, RLS, idempotency, pool hygiene | `withTransaction`, `setTenantContext`, `withTenantContext` exist; migrations 012/013 show RLS pattern | PARTIAL | Add migration 015 `context_snapshots` with RLS, INSERT-only for sealed state |
| 09 | Authorization and context minimization | `assertAgentCapability`, `setTenantContext` exist; capability denial is fail-closed | PARTIAL | Add `assertContextAuthorized` binding context contract to existing capability/tenant system |
| 10 | Record/replay and determinism — replay verifier for sealed snapshots | `DeterministicFakeProvider` is deterministic; `renderPipeline` has replay determinism | PARTIAL | Add `replaySnapshot` — read-only verification of sealed context without side effects |
| 11 | Concurrency, performance, resilience | Existing integration tests cover concurrent transactions | PARTIAL | Add concurrency tests for snapshot sealing under live PostgreSQL |
| 12 | Security and failure modes | Existing RLS/injection tests cover cross-tenant, SQL injection | PARTIAL | Add ECIDR-specific failure-mode tests: DOR abuse, cross-tenant context, tampered fragments |
| 13 | Test plan — contract, property, mutation, integration, replay, regression | Existing 424 tests (323 unit + 101 integration) all pass | PARTIAL | Add ECIDR test suite covering all new code paths |
| 14 | Minimum-delta file policy | — | — | Only add: context.ts (contracts), context.ts (domain), context.ts (db), migration 015, tests, README, report |
| 15 | Implementation order checkpoints 0-7 | — | — | Follow checkpoint order below |

## Checkpoint Order

0. ✅ Read-only baseline, source-of-truth, conflict report (this matrix)
1. Context Contract V1 + canonical hashing (contracts + domain)
2. Immutable snapshot persistence + transaction/RLS (db + migration 015)
3. Authorization + context sealing at existing four-agent consumption boundaries
4. Read-only deterministic/recorded replay verification
5. Security, concurrency, property/mutation, performance, regression suites
6. README + release history
7. Restore DIRECTIV.txt + commit + push

## Baseline Gate Results

- `pnpm typecheck`: exit 0 (all 6 packages)
- `pnpm lint`: exit 0 (eslint . --max-warnings 0)
- `pnpm test`: exit 0 (323 unit + 101 integration = 424 passed, 101 skipped without DB env)
- Live PostgreSQL: 424/424 passed with DATABASE_URL set (14 migrations applied)
