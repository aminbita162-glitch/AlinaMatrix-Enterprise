# Phase 5 Plan — Jobs, Four Agent Contracts, Fake Provider

Status: Enterprise Candidate — Active Development

## In-scope items (from DIRECTIV.txt Phase 5)

### 1. Database migration 004
Tables to create:
- `agents` — four agents seeded
- `agent_versions` — pinned capability/model snapshots
- `model_versions` — pinned model + temperature
- `prompt_versions` — versioned prompt text (content-addressed)
- `schema_versions` — versioned output JSON schemas
- `policy_versions` — versioned policy rules
- `workflows` — M03 pipeline definition per project
- `workflow_runs` — one run per workflow invocation
- `processing_jobs` — idempotent units of work
- `job_events` — immutable append-only state transition log
- `agent_runs` — one row per agent invocation within a job
- `usage_events` — one row per fake provider call (token counts, cost)
- `cache_entries` — deterministic fake-provider output keyed by cache key

### 2. Domain logic (`packages/domain/src/agents.ts`)
- `AgentCapability` type
- `AGENT_CAPABILITIES` map: four agents with their permitted capabilities
- `assertAgentCapability(agent, capability)` — throws CapabilityDeniedError
- `DeterministicFakeProvider.call(input)` — same prompt+schema+inputHash → same JSON
  - cache key: `tenant_id | source_versions | prompt | model | schema | policy`
  - returns deterministic JSON string; caller records usage_event
- `assertJobNotCancelled(job)` — throws CancelledJobError when state is CANCELLED
- `buildCacheKey(params)` — SHA-256 of canonical params string

### 3. Zod contracts (`packages/contracts/src/agents.ts`)
- `AgentCapabilitySchema`
- `AgentResponseSchema`
- `WorkflowResponseSchema`
- `WorkflowRunResponseSchema`
- `CreateJobRequestSchema` / `JobResponseSchema`
- `JobEventResponseSchema`
- `AgentRunResponseSchema`
- `UsageEventResponseSchema`
- `CacheEntryResponseSchema`

### 4. DB access layer (`packages/db/src/agents.ts`)
- `getAgent`, `listAgents`
- `insertWorkflow`, `getWorkflow`
- `insertWorkflowRun`, `getWorkflowRun`
- `insertJob`, `getJob` (idempotency_key deduplicated)
- `appendJobEvent`, `listJobEvents`
- `transitionJobState(job_id, from, to)` — validates via domain assertLegalTransition
- `insertAgentRun`, `getAgentRun`
- `insertUsageEvent`, `listUsageEventsByJob`
- `getOrInsertCacheEntry` — cross-tenant miss enforced by cache_key including tenant_id

### 5. Tests
#### Domain unit tests (`packages/domain/src/agents.test.ts`)
- Illegal workflow transition rejected
- Duplicate job idempotency returns existing (mocked)
- Cancelled job cannot publish (state transition check)
- Capability denial for restricted operations
- Cache isolation: same params, different tenant_id → different cache key
- DeterministicFakeProvider: same input hash → same output; different hash → different output

#### DB mock tests (`packages/db/src/agents.test.ts`)
- insertJob deduplication (idempotency_key)
- transitionJobState: legal and illegal transitions
- appendJobEvent returns ordered events
- getOrInsertCacheEntry: hit and miss
- insertUsageEvent round-trip

#### Integration tests (`packages/db/src/agents.integration.test.ts`)
- Live DB: illegal transition, duplicate job, cancelled cannot publish,
  capability denial, cache isolation (cross-tenant miss)

## Out of scope
- LLM API calls
- Workflow orchestration loop
- Actual document generation
- Any module outside M03
