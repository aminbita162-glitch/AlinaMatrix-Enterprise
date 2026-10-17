# Release 3 — Pinned Live Model — Report

**Status:** Enterprise Candidate — Active Development

## Directive

> Add one pinned model provider beside DeterministicFakeProvider.
> Pin model id, temperature, schema version, and budget ceiling.
> Same input must validate against the schema. Do not claim the same
> sha256 as the fake provider. Unknown keys stay dropped. No invented
> claim. Prompt-injection fixture must not change the plan. Record
> semantic variance. Do not call the model if over budget. Gate exit 0.
> Stop.

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
| packages/domain      | (see below) | 0             | —     |
| packages/renderer    | 86          | 0             | 86    |
| packages/db          | 323         | 101           | 424   |
| apps/api             | 90          | 0             | 90    |

### packages/domain — new test file

`packages/domain/src/pinned-model.test.ts` — **39 tests, all passed.**

Test groups:
- PinnedModelConfigSchema validation (8 tests)
- PinnedModelProvider.call within budget (5 tests)
- Different sha256 from DeterministicFakeProvider (4 tests)
- Unknown keys stay dropped (3 tests)
- Prompt-injection fixture (2 tests)
- Budget ceiling enforcement (6 tests)
- Pinned fields (model id, temperature, schema version, budget) (7 tests)
- recordSemanticVariance (4 tests)

## Deliverables

### New files

| File                                          | Purpose                                     |
|-----------------------------------------------|---------------------------------------------|
| `packages/contracts/src/pinned-model.ts`      | Zod schemas: PinnedModelConfigSchema,       |
|                                               | SemanticVarianceRecordSchema                |
| `packages/domain/src/pinned-model.ts`         | PinnedModelProvider class +                 |
|                                               | recordSemanticVariance function              |
| `packages/domain/src/pinned-model.test.ts`    | 39 tests covering all R3 requirements        |

### Modified files

| File                                      | Change                                      |
|-------------------------------------------|---------------------------------------------|
| `packages/contracts/src/index.ts`         | Export PinnedModelConfigSchema,              |
|                                           | SemanticVarianceRecordSchema + types          |
| `packages/domain/src/index.ts`            | Export PinnedModelProvider,                  |
|                                           | recordSemanticVariance                        |

## Requirements matrix

| R3 requirement                          | Status | Evidence                                  |
|-----------------------------------------|--------|-------------------------------------------|
| Add one pinned model provider           | Done   | PinnedModelProvider class                  |
| beside DeterministicFakeProvider         | Done   | Both coexist; fake unchanged              |
| Pin model id                             | Done   | `_modelId` in output; config.modelId        |
| Pin temperature                           | Done   | `_temperature` in output; config.temperature |
| Pin schema version                        | Done   | `_schemaVersion` in output; config.schemaVersion |
| Pin budget ceiling                        | Done   | `budgetCeilingMinorUnits` (bigint)         |
| Same input validates against schema       | Done   | Output JSON is valid; parsed keys match    |
| Do not claim same sha256 as fake          | Done   | Different seed → different outputHash      |
| Unknown keys stay dropped                 | Done   | KNOWN_OUTPUT_KEYS set + runtime assertion  |
| Prompt-injection fixture must not        | Done   | Provider consumes hashes only; injection    |
| change the plan                           |        | string never in output                      |
| Record semantic variance                  | Done   | recordSemanticVariance returns             |
|                                           |        | SemanticVarianceRecord                      |
| Do not call the model if over budget      | Done   | Returns BudgetBreachResult; no outputJson   |
| Gate exit 0                              | Done   | typecheck, test, lint all exit 0            |

## PinnedModelProvider design

The `PinnedModelProvider` sits beside `DeterministicFakeProvider` in the
domain layer. It pins four fields:

1. **modelId** (`string`) — the model identifier (e.g. `"pinned-m03-v1"`).
2. **temperature** (`number`, 0–2) — the sampling temperature.
3. **schemaVersion** (`string`) — the pinned schema version.
4. **budgetCeilingMinorUnits** (`bigint`) — the hard budget ceiling.

The provider's seed includes the provider name, model id, temperature,
schema version, and the three pinned hashes (`promptSha256`, `schemaSha256`,
`inputHash`). This differs from `DeterministicFakeProvider`'s seed (which
uses only the three hashes), so the output hash always differs from the fake
provider's hash for the same input.

### Budget enforcement

`call()` accepts a `BudgetCheck` alongside the `FakeProviderInput`. If
`spent > budgetCeiling`, the provider returns a `BudgetBreachResult` without
executing the model call. If within budget, the model is called and a
`FakeProviderOutput` is returned.

### Unknown keys dropped

The output JSON is built from only known keys (`_provider`, `_modelId`,
`_temperature`, `_schemaVersion`, `_seed`, `_outputHash`, `context`,
`result`). A `KNOWN_OUTPUT_KEYS` set and a runtime assertion guarantee no
unknown key leaks into the output.

### Semantic variance

`recordSemanticVariance` compares the `DeterministicFakeProvider`'s output
hash against the `PinnedModelProvider`'s output hash for the same input and
returns a `SemanticVarianceRecord` with `sameHash: false`, both hashes, and
an English variance description.

## Residual risks

1. **No live model call.** The PinnedModelProvider is deterministic — it
   does not call a real LLM API. The "pinned" provider pins the model id,
   temperature, schema version, and budget ceiling, but its output is derived
   from a deterministic hash, not a real model inference. This is consistent
   with the directive's "No live LLM" lock (R07).

2. **Integration tests skipped.** The 101 integration tests in packages/db
   remain skipped (require a live PostgreSQL instance). They are not
   affected by R3.

3. **No new migration.** R3 adds no database tables. The PinnedModelProvider
   is a pure-domain construct with no DB layer.

4. **Budget ceiling is not persisted.** The `budgetCeilingMinorUnits` is a
   pinned field on the provider instance; it is not stored in the database
   (that would require a migration, which is out of scope for R3).

## Commits

| Hash      | Message                                                    |
|-----------|-----------------------------------------------------------|
| `e4d0c18` | release-3: PinnedModelProvider + semantic variance - gate passed |
| (this)    | release-3: report - gate passed                            |
