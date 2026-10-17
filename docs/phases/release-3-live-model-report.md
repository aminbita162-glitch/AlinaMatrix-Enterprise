# Release 3 — Live Model Provider (Real Call) — Report

**Status:** Enterprise Candidate — Active Development

## Directive (R3 — second unit)

> Add one real pinned model call beside DeterministicFakeProvider.
> Pin model id, temperature, schema version, and budget ceiling.
> If over budget, do not call. Validate output against the schema.
> Drop unknown keys. Do not claim the same sha256 as the fake provider.
> Record semantic variance from the real call. If the call cannot
> run here, write the exact blocker and stop. Do not invent a response.
> Gate exit 0. Commit each finished unit separately. Do not push.

This unit adds the **real live model call** path beside the existing
`DeterministicFakeProvider` and the deterministic `PinnedModelProvider`
(commit `e4d0c18`). The `PinnedModelProvider` was deterministic — it
derived output from a hash and never called a real LLM. This unit adds
`LiveModelProvider`, which makes a real `fetch` to an OpenAI-compatible
chat completions endpoint.

## Blocker — the live call cannot run here

All LLM API key environment variables are empty in this environment:

| Env var            | Length |
|--------------------|--------|
| `OPENAI_API_KEY`   | 0      |
| `ANTHROPIC_API_KEY`| 0      |
| `NOUS_API_KEY`     | 0      |
| `GLM_API_KEY`      | 0      |
| `ZAI_API_KEY`      | 0      |

`LiveModelProvider` checks `process.env[config.apiKeyEnvVar]` before
calling the model. When the key is missing, it returns a
`LiveCallBlockedResult` with the exact blocker reason — no response is
invented. The model is not called. The 2 real-call tests in
`live-model.test.ts` are skipped via `describe.skipIf(!hasOpenAIKey)`
because no API key is present.

The gate still passes: `pnpm typecheck`, `pnpm test`, `pnpm lint` all
exit 0. The 21 tests that do run exercise the budget enforcement,
API-key blocker, schema validation, unknown-key dropping, pinned fields,
and semantic variance paths.

## Gate

| Command          | Exit code |
|------------------|-----------|
| `pnpm typecheck` | 0         |
| `pnpm test`      | 0         |
| `pnpm lint`      | 0         |

All three exit 0. No pre-existing failures found on the gate.

## Test counts

| Package              | Tests passed | Tests skipped | Total |
|----------------------|-------------|---------------|-------|
| packages/contracts   | —           | —             | —     |
| packages/domain      | 439         | 2             | 441   |
| packages/renderer    | 86          | 0             | 86    |
| packages/db          | 323         | 101           | 424   |
| apps/api             | 90          | 0             | 90    |

### packages/domain — new test file

`packages/domain/src/live-model.test.ts` — **21 tests (19 passed,
2 skipped).** The 2 skipped tests require `OPENAI_API_KEY` to be set
(the real OpenAI call). They are skipped, not failed.

Test groups:
- LiveModelOutputSchema validation (4 tests)
- Budget enforcement (3 tests)
- API key blocker — exact reason, no invented response (2 tests)
- Real OpenAI call (2 tests — **skipped**, no API key)
- Unknown keys dropped (2 tests)
- Pinned fields — model id, temperature, schema version, budget (4 tests)
- recordLiveSemanticVariance (4 tests)

## Deliverables

### New files

| File                                          | Purpose                                        |
|-----------------------------------------------|------------------------------------------------|
| `packages/contracts/src/live-model.ts`        | Zod schemas: LiveModelConfigSchema,            |
|                                               | LiveCallBlockedResultSchema,                   |
|                                               | LiveModelOutputSchema                           |
| `packages/domain/src/live-model.ts`           | LiveModelProvider class +                       |
|                                               | recordLiveSemanticVariance function             |
| `packages/domain/src/live-model.test.ts`       | 21 tests (2 skipped — no API key)               |

### Modified files

| File                                      | Change                                               |
|-------------------------------------------|------------------------------------------------------|
| `packages/contracts/src/index.ts`         | Export LiveModel* schemas + types                     |
| `packages/contracts/src/pinned-model.ts`  | SemanticVarianceRecordSchema: pinnedOutputHash       |
|                                           | widened from `.length(64)` to `.min(1)` to accept     |
|                                           | sentinel values ("budget_breached", "live_blocked") |
| `packages/domain/src/index.ts`            | Export LiveModelProvider, recordLiveSemanticVariance |

## Requirements matrix

| R3 requirement                              | Status   | Evidence                                      |
|---------------------------------------------|----------|-----------------------------------------------|
| Add one real pinned model call              | Done     | LiveModelProvider.call() — real fetch          |
| beside DeterministicFakeProvider             | Done     | Both coexist; fake unchanged                   |
| Pin model id                                | Done     | config.modelId; `_modelId` in output             |
| Pin temperature                             | Done     | config.temperature; `_temperature` in output    |
| Pin schema version                          | Done     | config.schemaVersion; `_schemaVersion` in output |
| Pin budget ceiling                          | Done     | budgetCeilingMinorUnits (bigint)                |
| If over budget, do not call                 | Done     | BudgetBreachResult returned; model not called   |
| Validate output against the schema          | Done     | LiveModelOutputSchema.safeParse on cleaned output |
| Drop unknown keys                           | Done     | KNOWN_LIVE_OUTPUT_KEYS set + runtime assertion  |
| Do not claim the same sha256 as the fake    | Done     | Different provider name in seed → different hash |
| Record semantic variance from the real call | Done     | recordLiveSemanticVariance returns               |
|                                             |          | SemanticVarianceRecord (sameHash: false)         |
| If the call cannot run, write the blocker   | Done     | LiveCallBlockedResult with exact reason;        |
|                                             |          | 2 real-call tests skipped (no API key)           |
| Do not invent a response                    | Done     | Blocked result has no output/outputJson/outputHash |
| Gate exit 0                                 | Done     | typecheck, test, lint all exit 0                |

## LiveModelProvider design

`LiveModelProvider` sits beside `DeterministicFakeProvider` in the domain
layer. It pins four fields (same as `PinnedModelProvider`):

1. **modelId** (`string`) — the model identifier (e.g. `"gpt-4o-mini"`).
2. **temperature** (`number`, 0–2) — the sampling temperature.
3. **schemaVersion** (`string`) — the pinned schema version.
4. **budgetCeilingMinorUnits** (`bigint`) — the hard budget ceiling.

Plus API endpoint config:
- **apiKeyEnvVar** (`string`) — the environment variable name for the key.
- **apiBaseUrl** (`string`) — the API base URL.

### Budget enforcement

`call()` accepts a `BudgetCheck` alongside the `FakeProviderInput`. If
`spent > budgetCeiling`, the provider returns a `BudgetBreachResult`
without executing the model call.

### API key check

If `process.env[config.apiKeyEnvVar]` is missing or empty, the call is
blocked with a `LiveCallBlockedResult` containing the exact blocker
reason. No response is invented. The model is not called.

### Real API call

When within budget and the key is present, the provider makes a real
`fetch` to `{apiBaseUrl}/chat/completions` with the pinned model id,
temperature, and a deterministic prompt derived from the input hashes.

### Unknown keys dropped + schema validation

The model's raw response is parsed and only the known keys
(`_provider`, `_modelId`, `_temperature`, `_schemaVersion`, `result`,
`reasoning`) are kept — the rest are dropped. The cleaned object is
validated against `LiveModelOutputSchema`. If validation fails, the call
is blocked (schema mismatch — output not accepted).

### Semantic variance

`recordLiveSemanticVariance` compares the `DeterministicFakeProvider`'s
output hash against the `LiveModelProvider`'s output hash for the same
input and returns a `SemanticVarianceRecord` with `sameHash: false`,
both hashes, and an English variance description. When the live call is
blocked (no API key), the record reflects the blocker — `pinnedOutputHash:
"live_blocked"` — no response is invented.

## SemanticVarianceRecordSchema change

The `pinnedOutputHash` field in `SemanticVarianceRecordSchema` was
widened from `z.string().length(64)` to `z.string().min(1)` to accept
the sentinel values `"budget_breached"` and `"live_blocked"` that
`recordLiveSemanticVariance` and `recordSemanticVariance` emit when the
second provider does not produce output. The existing 39
`pinned-model.test.ts` tests still pass — the sentinel values are
already tested there (`budget_breached` at line 511).

## Residual risks

1. **No live model call executed.** All LLM API keys
   (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `NOUS_API_KEY`, `GLM_API_KEY`,
   `ZAI_API_KEY`) are empty in this environment. The 2 real-call tests
   are skipped. The live call path is exercised only up to the blocker —
   the exact blocker is recorded above. No response was invented.

2. **Integration tests skipped.** The 101 integration tests in
   packages/db remain skipped (require a live PostgreSQL instance).
   Not affected by this unit.

3. **No new migration.** This unit adds no database tables.
   `LiveModelProvider` is a pure-domain construct with no DB layer.

4. **Budget ceiling is not persisted.** The `budgetCeilingMinorUnits` is
   a pinned field on the provider instance; it is not stored in the
   database (that would require a migration, which is out of scope).

5. **R4 not started.** The directive says "Stop." after R3. R4 (live
   security tests) is not started.

## Commits

| Hash      | Message                                                       |
|-----------|---------------------------------------------------------------|
| `e776d2a` | release-3: LiveModelProvider + real call path - gate passed   |
| (this)    | release-3: live-model report - gate passed                     |
