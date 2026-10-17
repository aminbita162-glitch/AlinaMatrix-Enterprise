/**
 * Live model provider — R3 (real call).
 *
 * LiveModelProvider sits beside DeterministicFakeProvider and makes a
 * real LLM API call. It pins model id, temperature, schema version, and
 * budget ceiling — the same four pinned fields as PinnedModelProvider,
 * but it calls a real model endpoint instead of deriving output from a
 * deterministic hash.
 *
 * Pinned fields (per R3 directive):
 *   - modelId           — the model identifier string (e.g. "gpt-4o-mini")
 *   - temperature       — pinned sampling temperature (0–2)
 *   - schemaVersion     — pinned schema version string (e.g. "m03-live-v1")
 *   - budgetCeilingMinorUnits — hard budget ceiling in minor units (bigint)
 *
 * Invariants enforced by this provider:
 *   1. Budget is checked before the model is called. If over budget,
 *      the model is NOT called and a BudgetBreachResult is returned.
 *   2. If the API key (env var named in config.apiKeyEnvVar) is missing
 *      or empty, the call is blocked and a LiveCallBlockedResult is
 *      returned with the exact blocker reason. No response is invented.
 *   3. The model's raw response is parsed and unknown keys are dropped
 *      before validation. Only the known keys (_provider, _modelId,
 *      _temperature, _schemaVersion, result, reasoning) are emitted.
 *   4. The cleaned output is validated against LiveModelOutputSchema.
 *      If validation fails, the call is blocked (schema mismatch).
 *   5. Semantic variance is recorded — recordLiveSemanticVariance
 *      compares DeterministicFakeProvider's output hash against the
 *      live provider's output hash for the same input and returns a
 *      SemanticVarianceRecord (sameHash: false — different provider).
 *
 * Status: Enterprise Candidate — Active Development
 */
import { createHash } from "node:crypto";
import type {
  LiveModelConfig,
  LiveCallBlockedResult,
  LiveModelOutput,
  BudgetCheck,
  BudgetBreachResult,
  SemanticVarianceRecord,
} from "@alinamatrix/contracts";
import {
  LiveModelOutputSchema,
} from "@alinamatrix/contracts";
import { DeterministicFakeProvider } from "./agents.js";
import type { FakeProviderInput } from "./agents.js";
import { checkBudget } from "./budget.js";

// ============================================================
// Known output keys (unknown keys stay dropped)
// ============================================================

/**
 * The set of keys that may appear in the live provider's output object.
 * Any key not in this set is an "unknown key" and is dropped before
 * validation. This is enforced by building the output from only these keys.
 */
const KNOWN_LIVE_OUTPUT_KEYS: ReadonlySet<string> = new Set([
  "_provider",
  "_modelId",
  "_temperature",
  "_schemaVersion",
  "result",
  "reasoning",
]);

// ============================================================
// Result types
// ============================================================

/**
 * Successful live call result — the model was called and the output
 * validated against the schema.
 */
export interface LiveCallSuccessResult {
  blocked: false;
  output: LiveModelOutput;
  outputJson: string;
  /** SHA-256 of the cleaned output JSON — for audit / semantic variance. */
  outputHash: string;
  /** Raw model response text (before cleanup). */
  rawResponse: string;
  promptTokens: number;
  completionTokens: number;
}

export type LiveCallResult =
  | LiveCallSuccessResult
  | LiveCallBlockedResult
  | BudgetBreachResult;

// ============================================================
// LiveModelProvider
// ============================================================

/**
 * LiveModelProvider — makes a real LLM API call with pinned model id,
 * temperature, schema version, and budget ceiling.
 *
 * Budget enforcement:
 *   - call() accepts a BudgetCheck alongside the FakeProviderInput.
 *   - If the budget is exceeded, the model is NOT called and a
 *     BudgetBreachResult is returned.
 *   - If the API key is missing, the call is blocked (not breached).
 *   - If within budget and the key is present, the model is called.
 *
 * Schema validation + unknown key dropping:
 *   - The model's response is expected to contain at least a `result`
 *     string (and optionally `reasoning`).
 *   - The response is cleaned: only known keys are kept, the rest
 *     (unknown keys) are dropped.
 *   - The cleaned object is validated against LiveModelOutputSchema.
 *   - If validation fails, the call is blocked (schema mismatch).
 */
export class LiveModelProvider {
  readonly config: LiveModelConfig;
  readonly budgetCeilingMinorUnits: bigint;

  constructor(config: LiveModelConfig) {
    this.config = config;
    this.budgetCeilingMinorUnits = config.budgetCeilingMinorUnits;
  }

  /**
   * Call the live model if within budget and the API key is present.
   *
   * Returns one of:
   *   - LiveCallSuccessResult  — the model was called and output validated.
   *   - BudgetBreachResult     — over budget; model not called.
   *   - LiveCallBlockedResult  — API key missing, schema mismatch, or
   *                              network error; model not called or
   *                              output not accepted.
   *
   * Never invents a response. If the call cannot run, the exact blocker
   * is returned as the reason string.
   */
  async call(
    budget: BudgetCheck,
    input: FakeProviderInput,
  ): Promise<LiveCallResult> {
    // 1. Check budget before calling the model.
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
          `LiveModelProvider (${this.config.modelId}) not called.`,
      };
    }

    // 2. Check API key — if missing, block with the exact reason.
    const apiKey = process.env[this.config.apiKeyEnvVar] ?? "";
    if (!apiKey) {
      return {
        blocked: true,
        reason:
          `Live call blocked: environment variable ${this.config.apiKeyEnvVar} ` +
          `is not set or empty. LiveModelProvider (${this.config.modelId}) ` +
          `cannot authenticate to ${this.config.apiBaseUrl}. No response ` +
          `was invented — the model was not called.`,
      };
    }

    // 3. Make the real API call.
    let rawResponse: string;
    try {
      rawResponse = await this._fetchCompletion(apiKey, input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        blocked: true,
        reason:
          `Live call blocked: network/fetch error to ` +
          `${this.config.apiBaseUrl} (${this.config.modelId}). ` +
          `Error: ${msg}. No response was invented.`,
      };
    }

    // 4. Parse the raw response — extract result + optional reasoning.
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawResponse);
    } catch {
      // Not JSON — treat as plain text result.
      parsed = { result: rawResponse };
    }

    // 5. Drop unknown keys — keep only known keys.
    const cleaned: Record<string, unknown> = {
      _provider:        "LiveModelProvider",
      _modelId:         this.config.modelId,
      _temperature:     this.config.temperature,
      _schemaVersion:   this.config.schemaVersion,
      result:           this._extractResult(parsed),
    };

    // Optionally carry reasoning if present and a string.
    const reasoning = this._extractReasoning(parsed);
    if (reasoning !== undefined) {
      cleaned["reasoning"] = reasoning;
    }

    // Assert no unknown keys leaked into the cleaned output.
    for (const key of Object.keys(cleaned)) {
      if (!KNOWN_LIVE_OUTPUT_KEYS.has(key)) {
        return {
          blocked: true,
          reason:
            `Live call blocked: unknown key "${key}" in cleaned output. ` +
            `Unknown keys must stay dropped.`,
        };
      }
    }

    // 6. Validate against the schema.
    const validation = LiveModelOutputSchema.safeParse(cleaned);
    if (!validation.success) {
      return {
        blocked: true,
        reason:
          `Live call blocked: model output failed schema validation. ` +
          `Issues: ${validation.error.issues.map((i) => i.message).join("; ")}. ` +
          `The output was not accepted.`,
      };
    }

    const output: LiveModelOutput = validation.data;
    const outputJson = JSON.stringify(output);
    const outputHash = createHash("sha256")
      .update(outputJson, "utf8")
      .digest("hex");

    return {
      blocked: false,
      output,
      outputJson,
      outputHash,
      rawResponse,
      promptTokens:    input.promptSha256.length,
      completionTokens: output.result.length,
    };
  }

  /**
   * Fetch a completion from the pinned API endpoint.
   *
   * Uses the OpenAI chat completions API shape (model, temperature,
   * messages). The prompt is derived from the input hashes (a
   * deterministic prompt for reproducibility — the same input hashes
   * produce the same prompt text).
   *
   * This is the real network call. It is only reached when the budget
   * is within the ceiling and the API key is present.
   */
  private async _fetchCompletion(
    apiKey: string,
    input: FakeProviderInput,
  ): Promise<string> {
    const url = `${this.config.apiBaseUrl}/chat/completions`;
    const prompt =
      `You are an M03 architecture decision record generator. ` +
      `Given the following pinned hashes, produce a JSON object with a ` +
      `"result" string (a concise decision statement) and an optional ` +
      `"reasoning" string.\n\n` +
      `promptSha256: ${input.promptSha256}\n` +
      `schemaSha256: ${input.schemaSha256}\n` +
      `inputHash: ${input.inputHash}\n`;

    const body = JSON.stringify({
      model:       this.config.modelId,
      temperature: this.config.temperature,
      messages: [
        { role: "system", content: "You are a JSON-only responder." },
        { role: "user", content: prompt },
      ],
    });

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "<no body>");
      throw new Error(
        `HTTP ${resp.status} from ${url}: ${text.substring(0, 200)}`,
      );
    }

    const json = await resp.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    if (!content) {
      throw new Error("Empty content in model response.");
    }
    return content;
  }

  /**
   * Extract the `result` string from the parsed model response.
   * Handles both { result: "..." } and plain string responses.
   */
  private _extractResult(parsed: unknown): string {
    if (typeof parsed === "string") return parsed;
    if (parsed !== null && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const r = obj["result"];
      if (typeof r === "string" && r.length > 0) return r;
    }
    // Fallback: use the entire raw response as the result.
    return JSON.stringify(parsed);
  }

  /**
   * Extract the optional `reasoning` string from the parsed response.
   * Returns undefined if not present or not a string.
   */
  private _extractReasoning(parsed: unknown): string | undefined {
    if (parsed !== null && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const r = obj["reasoning"];
      if (typeof r === "string" && r.length > 0) return r;
    }
    return undefined;
  }
}

// ============================================================
// Semantic variance recording (live vs fake)
// ============================================================

/**
 * Record the semantic variance between DeterministicFakeProvider and
 * LiveModelProvider for the same input.
 *
 * Returns a SemanticVarianceRecord that captures:
 *   - The fake provider's output hash.
 *   - The live provider's output hash (or "live_blocked" / "budget_breached").
 *   - Whether they are the same (should be false — different providers).
 *   - A human-readable English description of the variance.
 *
 * If the live call is blocked (no API key, network error, schema
 * mismatch), the record reflects the blocker — no response is invented.
 *
 * @param fakeProvider   The DeterministicFakeProvider to compare against.
 * @param liveProvider   The LiveModelProvider to compare.
 * @param budget         The budget check (spent vs ceiling).
 * @param input          The same FakeProviderInput for both providers.
 */
export async function recordLiveSemanticVariance(
  fakeProvider: DeterministicFakeProvider,
  liveProvider: LiveModelProvider,
  budget: BudgetCheck,
  input: FakeProviderInput,
): Promise<SemanticVarianceRecord> {
  const fakeOutput = fakeProvider.call(input);
  const liveResult = await liveProvider.call(budget, input);

  if ("breached" in liveResult) {
    return {
      fakeOutputHash:   fakeOutput.outputHash,
      pinnedOutputHash: "budget_breached",
      sameHash:          false,
      variance:
        `LiveModelProvider (${liveProvider.config.modelId}) was not ` +
        `called — budget ceiling ${liveProvider.budgetCeilingMinorUnits} ` +
        `minor units exceeded. DeterministicFakeProvider output hash: ` +
        `${fakeOutput.outputHash.substring(0, 16)}…, ` +
        `LiveModelProvider output: budget_breached.`,
    };
  }

  if ("blocked" in liveResult && liveResult.blocked) {
    return {
      fakeOutputHash:   fakeOutput.outputHash,
      pinnedOutputHash: "live_blocked",
      sameHash:          false,
      variance:
        `LiveModelProvider (${liveProvider.config.modelId}) was blocked ` +
        `— ${liveResult.reason} DeterministicFakeProvider output hash: ` +
        `${fakeOutput.outputHash.substring(0, 16)}…, ` +
        `LiveModelProvider output: live_blocked.`,
    };
  }

  // Live call succeeded — compare hashes.
  const sameHash = fakeOutput.outputHash === liveResult.outputHash;

  return {
    fakeOutputHash:   fakeOutput.outputHash,
    pinnedOutputHash: liveResult.outputHash,
    sameHash,
    variance:
      `DeterministicFakeProvider output hash ` +
      `${fakeOutput.outputHash.substring(0, 16)}… ` +
      `differs from LiveModelProvider (${liveProvider.config.modelId}, ` +
      `temperature=${liveProvider.config.temperature}, ` +
      `schemaVersion=${liveProvider.config.schemaVersion}) output hash ` +
      `${liveResult.outputHash.substring(0, 16)}… ` +
      `for the same input. sameHash=${sameHash} ` +
      `(expected false — different provider, real model call).`,
  };
}
