# Level Up — Phase B Report: Pinned Live Model

**Status:** Enterprise Candidate — Active Development

**Date:** 2026-10-17

**Phase:** Level Up — Phase B (Pinned Live Model)

---

## Directive (verbatim)

> Add one real pinned model call beside DeterministicFakeProvider.
> Pin model id, temperature, schema version, and budget ceiling.
> If over budget, do not call. Validate output against the schema.
> Drop unknown keys. Do not claim the same sha256 as the fake provider.
> Record semantic variance from the real call. If the call cannot run here,
> write the exact blocker and stop. Do not invent a response.
> Gate exit 0. Stop.

---

## Summary

Phase B requires a pinned live model call beside `DeterministicFakeProvider`.
This was already built during Release R3 as two units:

1. **`PinnedModelProvider`** — `packages/domain/src/pinned-model.ts`
2. **`LiveModelProvider`** — `packages/domain/src/live-model.ts`

Per the directive's AGENT CONTROL rule ("If something already exists, verify
it and do not redo it"), no source was modified. Both providers were verified
against every Phase B requirement (see Requirements Matrix below). The gate
was run and passes. The real live call cannot run in this environment because
no API key is set — the exact blocker is recorded below.

---

## Deliverables (verified in place)

| # | Item | Path | Status |
|---|------|------|--------|
| 1 | `PinnedModelProvider` class | `packages/domain/src/pinned-model.ts:90` | Verified |
| 2 | `LiveModelProvider` class | `packages/domain/src/live-model.ts:116` | Verified |
| 3 | `recordSemanticVariance` (pinned vs fake) | `packages/domain/src/pinned-model.ts:206` | Verified |
| 4 | `recordLiveSemanticVariance` (live vs fake) | `packages/domain/src/live-model.ts:362` | Verified |
| 5 | `PinnedModelConfigSchema` (contracts) | `packages/contracts/src/pinned-model.ts` | Verified |
| 6 | `LiveModelConfigSchema`, `LiveModelOutputSchema`, `LiveCallBlockedResultSchema` | `packages/contracts/src/live-model.ts` | Verified |
| 7 | Pinned-model tests | `packages/domain/src/pinned-model.test.ts` | Verified |
| 8 | Live-model tests | `packages/domain/src/live-model.test.ts` | Verified |
| 9 | Domain re-exports | `packages/domain/src/index.ts:223-231` | Verified |
| 10 | Contracts re-exports | `packages/contracts/src/index.ts:328-334` | Verified |

---

## Requirements Matrix

| Phase B Requirement | Evidence | Satisfied |
|---------------------|----------|-----------|
| One real pinned model call beside DeterministicFakeProvider | `LiveModelProvider` at `live-model.ts:116` makes a real `fetch` to an OpenAI-compatible `/chat/completions` endpoint (`_fetchCompletion`, line 262). `PinnedModelProvider` is a deterministic second provider. Both sit beside `DeterministicFakeProvider`. | Yes |
| Pin model id | `config.modelId` — used in seed (`pinned-model.ts:135`) and request body (`live-model.ts:277`) | Yes |
| Pin temperature | `config.temperature` — used in seed (`pinned-model.ts:136`) and request body (`live-model.ts:278`) | Yes |
| Pin schema version | `config.schemaVersion` — used in seed (`pinned-model.ts:137`) and output (`live-model.ts:200`) | Yes |
| Pin budget ceiling | `config.budgetCeilingMinorUnits` (bigint) — `budgetCeilingMinorUnits` field, checked via `checkBudget` before any call (`pinned-model.ts:115`, `live-model.ts:143`) | Yes |
| If over budget, do not call | `checkBudget` runs first; if `!passed`, returns `BudgetBreachResult` without calling (`pinned-model.ts:119-128`, `live-model.ts:147-156`) | Yes |
| Validate output against the schema | `LiveModelOutputSchema.safeParse(cleaned)` (`live-model.ts:223`); schema-mismatch blocks the call (`live-model.ts:224-232`) | Yes |
| Drop unknown keys | `KNOWN_OUTPUT_KEYS` / `KNOWN_LIVE_OUTPUT_KEYS` sets — output built from only known keys; runtime assertion drops unknowns (`pinned-model.ts:57-66,158-165`, `live-model.ts:59-66,211-220`) | Yes |
| Do not claim the same sha256 as the fake provider | Seed includes `"PinnedModelProvider"` / provider name + model id (`pinned-model.ts:133-141`) — differs from `DeterministicFakeProvider`'s seed. `sameHash` asserted false in `recordSemanticVariance` and `recordLiveSemanticVariance`. | Yes |
| Record semantic variance from the real call | `recordSemanticVariance` (`pinned-model.ts:206`) and `recordLiveSemanticVariance` (`live-model.ts:362`) — both return a `SemanticVarianceRecord` with `fakeOutputHash`, `pinnedOutputHash`, `sameHash`, `variance`. | Yes |
| If the call cannot run here, write the exact blocker and stop | See Live Call Blocker below. | Yes |
| Do not invent a response | `LiveModelProvider` never invents — missing key returns `LiveCallBlockedResult` with exact reason (`live-model.ts:160-169`); network error returns blocked (`live-model.ts:177-184`); schema mismatch returns blocked (`live-model.ts:224-232`). | Yes |

---

## Live Call Blocker (exact)

The real `LiveModelProvider.call()` cannot run in this environment:

- **Blocker:** `OPENAI_API_KEY` environment variable is not set (verified:
  `echo` output: `OPENAI_API_KEY set: no`).
- **Effect:** `LiveModelProvider.call()` returns a `LiveCallBlockedResult`
  with reason `"Live call blocked: environment variable
  ${apiKeyEnvVar} is not set or empty. LiveModelProvider (${modelId})
  cannot authenticate to ${apiBaseUrl}. No response was invented — the
  model was not called."` (`live-model.ts:160-169`).
- **Test coverage:** 2 tests in `live-model.test.ts` are skipped via
  `describe.skipIf(!hasOpenAIKey)` at line 201 — they exercise the real
  OpenAI call path and are correctly skipped (not failed) when no key is
  present. They are not passed.
- **No response was invented.** The blocker is recorded as a factual
  statement. No live URL, hash, score, or model output is claimed.

---

## Budget Enforcement (verified)

Both providers check the budget before any model call:

```
checkBudget({ spentMinorUnits, budgetMinorUnits: ceiling })
  → if !passed: return BudgetBreachResult (model NOT called)
  → if  passed: proceed to call / derive output
```

`budgetMinorUnits` is `bigint` (exact minor-unit arithmetic — no
floating-point precision loss). `BudgetBreachResult` carries the exact
over-by amount and the provider's model id in the reason string.

---

## Unknown Key Dropping (verified)

- `PinnedModelProvider`: `KNOWN_OUTPUT_KEYS` = `{ _provider, _modelId,
  _temperature, _schemaVersion, _seed, _outputHash, context, result }`.
  Output built from only these keys; a runtime loop asserts no unknown key
  leaked (`pinned-model.ts:158-165`).
- `LiveModelProvider`: `KNOWN_LIVE_OUTPUT_KEYS` = `{ _provider, _modelId,
  _temperature, _schemaVersion, result, reasoning }`. Cleaned object built
  from only these keys; unknown key in cleaned output blocks the call
  (`live-model.ts:211-220`).

---

## Semantic Variance (verified)

`recordSemanticVariance` and `recordLiveSemanticVariance` both:

1. Call `DeterministicFakeProvider` for the same input → `fakeOutputHash`.
2. Call the pinned/live provider for the same input → `pinnedOutputHash`
   (or sentinel `"budget_breached"` / `"live_blocked"` when blocked).
3. Assert `sameHash: false` — the seed differs, so the hashes differ.
4. Return a `SemanticVarianceRecord` with an English `variance` description
   referencing both provider names, model id, temperature, and schema
   version.

`SemanticVarianceRecordSchema.pinnedOutputHash` was widened from
`.length(64)` to `.min(1)` during R3 to accept the sentinel strings
(`"budget_breached"`, `"live_blocked"`) — so the schema validates both
real hashes and blockers.

---

## Gate Results

| Command | Exit Code | Notes |
|---------|-----------|-------|
| `pnpm typecheck` | 0 | 6 workspace projects — all `tsc --noEmit` pass |
| `pnpm test` | 0 | 938 passed, 103 skipped (101 integration + 2 live-model real-call) |
| `pnpm lint` | 0 | `eslint . --max-warnings 0` — clean |

### Test counts (per package)

| Package | Tests | Skipped |
|---------|-------|---------|
| `packages/domain` | 439 passed | 2 skipped (live-model real call — no API key) |
| `packages/db` | 323 passed | 101 skipped (integration — no `DATABASE_URL`) |
| `packages/renderer` | 86 passed | 0 |
| `apps/api` | 90 passed | 0 |
| **Total** | **938 passed** | **103 skipped** |

A skipped test is not passed. The 2 live-model skips are the exact blocker
evidence — the real call did not run because no API key is set.

---

## What Changed

Nothing. Per AGENT CONTROL, both providers already exist (built during R3)
and satisfy every Phase B requirement. Source was verified, not modified.
The only artifact produced this phase is this report.

---

## Residual Risks

1. **No real live call recorded.** `LiveModelProvider`'s real OpenAI call
   path is skipped in this environment (no `OPENAI_API_KEY`). The provider
   is structurally correct and unit-tested for every other path (budget
   breach, missing key, unknown keys, schema mismatch, semantic variance),
   but no real model response has been observed. A skipped test is not
   passed.
2. **PinnedModelProvider is deterministic, not live.** It derives output
   from a hash seed — it does not call a real model. The directive's
   "real pinned model call" is satisfied by `LiveModelProvider`; the
   `PinnedModelProvider` satisfies the "pin model id, temperature, schema
   version, budget ceiling" + "different sha256" + "semantic variance"
   invariants deterministically.
3. **No deployed service.** Phase A recorded the deploy blocker (no Render
   account / live PostgreSQL). The live model call would target a real
   endpoint regardless of deploy state — the blocker is the API key, not
   the deploy.

---

## Honest Status

- **Pinned model providers:** Built, verified, gate-green.
- **Real live call:** Blocked — `OPENAI_API_KEY` not set. Not run. Not
  claimed. Not invented.
- **Candidate:** Maintained. Not production. A small test count is not
  proof of real-world capacity.
- **Status line:** Enterprise Candidate — Active Development.

---

## Stop

Phase B complete. Gate passed. The real live call is blocked (no API key);
the blocker is recorded above. Do not start Phase C.
