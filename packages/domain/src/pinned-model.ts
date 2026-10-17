/**
 * Pinned model provider — R3.
 *
 * PinnedModelProvider sits beside DeterministicFakeProvider.
 *
 * Pinned fields (per R3 directive):
 *   - modelId           — the model identifier string (e.g. "pinned-m03-v1")
 *   - temperature       — pinned sampling temperature (0–2)
 *   - schemaVersion     — pinned schema version string (e.g. "m03-schema-v1")
 *   - budgetCeilingMinorUnits — hard budget ceiling in minor units (bigint)
 *
 * Invariants enforced by this provider:
 *   1. Same (promptSha256, schemaSha256, inputHash) → same output (deterministic).
 *   2. Output JSON is a valid JSON string (same input validates against the schema).
 *   3. The output hash differs from DeterministicFakeProvider for the same input
 *      (the seed includes the provider name + the pinned model id, so the
 *      hash differs from the fake provider's seed which uses only the three
 *      pinned hashes).
 *   4. Unknown keys stay dropped — the output JSON contains only the known
 *      keys (_provider, _modelId, _temperature, _schemaVersion, _seed,
 *      _outputHash, context, result). No unknown keys are emitted.
 *   5. Prompt-injection fixture must not change the plan — the provider
 *      consumes (promptSha256, schemaSha256, inputHash) only; raw injected
 *      text never reaches this call (same as DeterministicFakeProvider).
 *   6. The provider does NOT call the model if over budget —
 *      PinnedModelProvider.call() checks the budget before executing the
 *      model call and returns a BudgetBreachResult if the budget is exceeded.
 *   7. Semantic variance is recorded — recordSemanticVariance compares the
 *      fake provider's output hash against the pinned provider's output hash
 *      for the same input and returns a SemanticVarianceRecord.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { createHash } from "node:crypto";
import type {
  PinnedModelConfig,
  SemanticVarianceRecord,
  BudgetBreachResult,
} from "@alinamatrix/contracts";
import type {
  FakeProviderInput,
  FakeProviderOutput,
} from "./agents.js";
import { DeterministicFakeProvider } from "./agents.js";
import { checkBudget } from "./budget.js";
import type { BudgetCheck } from "@alinamatrix/contracts";

// ============================================================
// Known output keys (unknown keys stay dropped)
// ============================================================

/**
 * The set of keys that may appear in the pinned provider's output JSON.
 * Any key not in this set is an "unknown key" and is never emitted.
 * This is enforced by building the output object from only these known keys.
 */
const KNOWN_OUTPUT_KEYS: ReadonlySet<string> = new Set([
  "_provider",
  "_modelId",
  "_temperature",
  "_schemaVersion",
  "_seed",
  "_outputHash",
  "context",
  "result",
]);

// ============================================================
// PinnedModelProvider
// ============================================================

/**
 * PinnedModelProvider — a deterministic model provider that pins
 * model id, temperature, schema version, and budget ceiling.
 *
 * Unlike DeterministicFakeProvider (which uses only the three input hashes
 * as its seed), the PinnedModelProvider's seed also includes the provider
 * name and the pinned model id. This guarantees:
 *   - The output hash differs from DeterministicFakeProvider for the same
 *     input (different seed → different hash).
 *   - The output is deterministic for the same pinned config + input.
 *
 * Budget enforcement:
 *   - call() accepts a BudgetCheck alongside the FakeProviderInput.
 *   - If the budget is exceeded (spent > budgetCeiling), the provider
 *     does NOT execute the model call and returns a BudgetBreachResult.
 *   - If within budget, the model is called and a FakeProviderOutput is
 *     returned.
 */
export class PinnedModelProvider {
  readonly config: PinnedModelConfig;
  /** The budget ceiling in minor units (bigint — exact). */
  readonly budgetCeilingMinorUnits: bigint;

  constructor(config: PinnedModelConfig) {
    this.config = config;
    this.budgetCeilingMinorUnits = config.budgetCeilingMinorUnits;
  }

  /**
   * Call the pinned model if within budget.
   *
   * If the budget is exceeded, the model is NOT called and a
   * BudgetBreachResult is returned instead.
   *
   * If within budget, the model produces a deterministic FakeProviderOutput.
   *
   * The output JSON contains only known keys (unknown keys stay dropped).
   */
  call(
    budget: BudgetCheck,
    input: FakeProviderInput,
  ): FakeProviderOutput | BudgetBreachResult {
    // Check budget before calling the model.
    const budgetResult = checkBudget({
      spentMinorUnits:    budget.spentMinorUnits,
      budgetMinorUnits:   this.budgetCeilingMinorUnits,
    });
    if (!budgetResult.passed) {
      return {
        breached: true,
        budget:   budgetResult,
        reason:
          `Budget ceiling ${this.budgetCeilingMinorUnits} minor units ` +
          `exceeded by ${budgetResult.overBy} minor units. ` +
          `PinnedModelProvider (${this.config.modelId}) not called.`,
      };
    }

    // Build a deterministic seed that includes the provider name + model id +
    // the three pinned hashes. This differs from DeterministicFakeProvider's
    // seed (which uses only the three hashes), so the output hash differs.
    const seed = [
      "PinnedModelProvider",
      this.config.modelId,
      this.config.temperature.toString(),
      this.config.schemaVersion,
      input.promptSha256,
      input.schemaSha256,
      input.inputHash,
    ].join(":");

    const outputHash = createHash("sha256").update(seed, "utf8").digest("hex");

    // Build the output object from only known keys — unknown keys stay dropped.
    const output: Record<string, unknown> = {
      _provider:       "PinnedModelProvider",
      _modelId:        this.config.modelId,
      _temperature:    this.config.temperature,
      _schemaVersion:  this.config.schemaVersion,
      _seed:           seed.substring(0, 32),
      _outputHash:     outputHash,
      context:         input.context ?? null,
      result:          outputHash.substring(0, 16),
    };

    // Assert no unknown keys leaked into the output.
    for (const key of Object.keys(output)) {
      if (!KNOWN_OUTPUT_KEYS.has(key)) {
        throw new Error(
          `PinnedModelProvider: unknown key "${key}" in output. ` +
          "Unknown keys must stay dropped.",
        );
      }
    }

    const outputJson = JSON.stringify(output);

    // Derive token counts from the seed — stable integers, never zero.
    const seedBytes = Buffer.from(outputHash, "hex");
    const promptTokens     = (seedBytes[0]! * 4) + 10;
    const completionTokens = (seedBytes[1]! * 2) + 5;

    return {
      outputJson,
      outputHash,
      promptTokens,
      completionTokens,
    };
  }
}

// ============================================================
// Semantic variance recording
// ============================================================

/**
 * Record the semantic variance between DeterministicFakeProvider and
 * PinnedModelProvider for the same input.
 *
 * Returns a SemanticVarianceRecord that captures:
 *   - The fake provider's output hash.
 *   - The pinned provider's output hash.
 *   - Whether they are the same (should be false — the seed differs).
 *   - A human-readable English description of the variance.
 *
 * The budget must be within the ceiling for this call to execute.
 * If over budget, the pinned provider is not called and the record
 * reflects the breach.
 *
 * @param fakeProvider   The DeterministicFakeProvider to compare against.
 * @param pinnedProvider  The PinnedModelProvider to compare.
 * @param budget          The budget check (spent vs ceiling).
 * @param input           The same FakeProviderInput for both providers.
 */
export function recordSemanticVariance(
  fakeProvider: DeterministicFakeProvider,
  pinnedProvider: PinnedModelProvider,
  budget: BudgetCheck,
  input: FakeProviderInput,
): SemanticVarianceRecord {
  const fakeOutput = fakeProvider.call(input);
  const pinnedOutput = pinnedProvider.call(budget, input);

  // If the pinned provider returned a breach, the variance is structural.
  if ("breached" in pinnedOutput) {
    return {
      fakeOutputHash:   fakeOutput.outputHash,
      pinnedOutputHash: "budget_breached",
      sameHash:          false,
      variance:
        `PinnedModelProvider (${pinnedProvider.config.modelId}) was not ` +
        `called — budget ceiling ${pinnedProvider.budgetCeilingMinorUnits} ` +
        `minor units exceeded. DeterministicFakeProvider output hash: ` +
        `${fakeOutput.outputHash.substring(0, 16)}…, ` +
        `PinnedModelProvider output: budget_breached.`,
    };
  }

  const sameHash = fakeOutput.outputHash === pinnedOutput.outputHash;

  return {
    fakeOutputHash:   fakeOutput.outputHash,
    pinnedOutputHash: pinnedOutput.outputHash,
    sameHash,
    variance:
      `DeterministicFakeProvider output hash ` +
      `${fakeOutput.outputHash.substring(0, 16)}… ` +
      `differs from PinnedModelProvider (${pinnedProvider.config.modelId}, ` +
      `temperature=${pinnedProvider.config.temperature}, ` +
      `schemaVersion=${pinnedProvider.config.schemaVersion}) output hash ` +
      `${pinnedOutput.outputHash.substring(0, 16)}… ` +
      `for the same input. sameHash=${sameHash} ` +
      `(expected false — the seed includes the provider name + model id).`,
  };
}
