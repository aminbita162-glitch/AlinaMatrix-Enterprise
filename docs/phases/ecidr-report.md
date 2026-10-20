# ECIDR — Release History

## 2026-10-20 — ECIDR: Verifiable Evidence Context Integrity & Deterministic Replay

**Directive:** ECIDR v1.0 (2026-10-20)  
**Status:** COMPLETE — all mandatory acceptance criteria passed.  
**Baseline SHA:** `87149b23a9461fe2e90393f3b4596ff227e98e84`  
**Completion date:** 2026-10-20  

### Implemented

- **Context Contract V1** (`packages/contracts/src/context.ts`): strict runtime-validated Zod
  schema binding `contractVersion='1'`, `tenantId`, `projectId`, `workflowRunId`, `jobId`,
  `agentName`, `taskKind`, `sourceRefs[]`, `promptSha256`, `schemaSha256`, `policySha256`,
  `modelVersionId`, `agentVersionId`, `canonicalizationVersion`, `contextPayloadSha256`,
  `snapshotSha256`, `createdAt` (audit metadata), `authorizationDecisionId`.
- **Canonicalization** (`packages/domain/src/context.ts`): domain-separated SHA-256 over UTF-8
  canonical JSON with sorted keys, sorted source refs, `createdAt` excluded from content digest.
- **Snapshot lifecycle**: PREPARED → SEALED → CONSUMED (or REJECTED) state machine with
  `sealSnapshot`, `consumeSnapshot`, `rejectSnapshot`, `assertLegalSnapshotTransition`.
- **Replay verification**: `replaySnapshot` — read-only, no side effects, rejects tampered
  tenant/source/policy/hash with typed `ContextReplayError`.
- **Authorization**: `assertContextAuthorized` binds to existing `assertAgentCapability` +
  agent name match + RELEASE/EXPORT denial.
- **Database**: migration 015 `context_snapshots` — RLS with `FORCE`, `app_user`
  SELECT+INSERT+UPDATE, immutability triggers, idempotent `UNIQUE (tenant_id, job_id,
  snapshot_sha256)`.
- **DB layer**: `packages/db/src/context.ts` — insert (idempotent via savepoint), seal, consume,
  reject, get, list.

### Tests

- `packages/domain/src/context.test.ts`: 61 tests (schema, canonical ordering, deterministic
  hashes, golden vectors, mutation testing, authorization, lifecycle, state transitions,
  replay, cross-tenant isolation).
- `packages/db/src/context.test.ts`: 14 unit tests (mock client).
- `packages/db/src/context.integration.test.ts`: 8 live PostgreSQL tests (tenant isolation, seal,
  consume, reject, idempotent insert, SEALED/CONSUMED immutability).

### Gate

- `pnpm typecheck`: exit 0
- `pnpm lint`: exit 0
- `pnpm test`: exit 0 (1227 passed with live DB; 1118 without DB env, 109 skipped)

### Reused existing capabilities

- `assertAgentCapability` + `CapabilityDeniedError` from `packages/domain/src/agents.ts`
- `setTenantContext` / `withTenantContext` from `packages/db/src/tenant-context.ts`
- `withTransaction` from `packages/db/src/client.ts`
- `sortKeys` canonicalization pattern from `packages/domain/src/provenance.ts`
- `createHash("sha256")` pattern from existing domain modules
- Zod schema conventions from `packages/contracts/src/` (`.strict()`, UUID, SHA-256, ISO-UTC)

### Known limitations

- The context contract is not yet wired into the live API router's agent call sites — the
  integration is at the domain and DB layer. API-level integration requires a future phase.
- Live LLM calls are not made (DeterministicFakeProvider only).
- Security coverage is unit + integration test level (mock + live PostgreSQL), not live
  penetration testing.
- No regional disaster recovery.
