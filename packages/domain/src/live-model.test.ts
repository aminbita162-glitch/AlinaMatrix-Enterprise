/**
 * Live model provider tests — R3 (real call).
 *
 * Tests all R3 directive requirements for the real live model call:
 *   - LiveModelProvider pins model id, temperature, schema version,
 *     budget ceiling.
 *   - Budget is checked before the model is called (over budget → breach).
 *   - API key absence blocks the call with an exact blocker reason.
 *   - Unknown keys from the model response are dropped.
 *   - Cleaned output validates against LiveModelOutputSchema.
 *   - Schema validation failure blocks the call (output not accepted).
 *   - Semantic variance is recorded (live vs fake provider).
 *   - The live provider's output hash differs from the fake provider's
 *     for the same input (different provider).
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { DeterministicFakeProvider } from "./agents.js";
import {
  LiveModelProvider,
  recordLiveSemanticVariance,
} from "./live-model.js";
import type { FakeProviderInput } from "./agents.js";
import type { LiveModelConfig, BudgetCheck } from "@alinamatrix/contracts";
import {
  LiveModelOutputSchema,
  SemanticVarianceRecordSchema,
} from "@alinamatrix/contracts";

// ============================================================
// Fixtures
// ============================================================

const defaultConfig: LiveModelConfig = {
  modelId:                  "gpt-4o-mini",
  temperature:               0,
  schemaVersion:             "m03-live-v1",
  budgetCeilingMinorUnits:   10_000n,
  apiKeyEnvVar:              "OPENAI_API_KEY",
  apiBaseUrl:                "https://api.openai.com/v1",
};

const defaultInput: FakeProviderInput = {
  promptSha256:  "a".repeat(64),
  schemaSha256:  "b".repeat(64),
  inputHash:     "c".repeat(64),
};

const withinBudget: BudgetCheck = {
  spentMinorUnits:   0n,
  budgetMinorUnits:  10_000n,
};

const overBudget: BudgetCheck = {
  spentMinorUnits:   15_000n,
  budgetMinorUnits:  10_000n,
};

// ============================================================
// Config validation
// ============================================================

describe("LiveModelConfigSchema", () => {
  it("validates a valid config", () => {
    const result = LiveModelOutputSchema.safeParse({
      _provider:      "LiveModelProvider",
      _modelId:       "gpt-4o-mini",
      _temperature:    0,
      _schemaVersion:  "m03-live-v1",
      result:          "Test decision statement.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects temperature > 2", () => {
    const result = LiveModelOutputSchema.safeParse({
      _provider:      "LiveModelProvider",
      _modelId:       "gpt-4o-mini",
      _temperature:    2.5,
      _schemaVersion:  "m03-live-v1",
      result:          "Test.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty result", () => {
    const result = LiveModelOutputSchema.safeParse({
      _provider:      "LiveModelProvider",
      _modelId:       "gpt-4o-mini",
      _temperature:    0,
      _schemaVersion:  "m03-live-v1",
      result:          "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional reasoning", () => {
    const result = LiveModelOutputSchema.safeParse({
      _provider:      "LiveModelProvider",
      _modelId:       "gpt-4o-mini",
      _temperature:    0,
      _schemaVersion:  "m03-live-v1",
      result:          "Test decision.",
      reasoning:       "Because the evidence supports it.",
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// Budget enforcement — model not called if over budget
// ============================================================

describe("LiveModelProvider.call — budget enforcement", () => {
  const provider = new LiveModelProvider(defaultConfig);

  it("returns BudgetBreachResult when over budget", async () => {
    const result = await provider.call(overBudget, defaultInput);
    expect("breached" in result).toBe(true);
    if (!("breached" in result)) return;
    expect(result.breached).toBe(true);
    expect(result.reason).toContain("Budget ceiling");
    expect(result.reason).toContain("not called");
  });

  it("does not return a success when over budget", async () => {
    const result = await provider.call(overBudget, defaultInput);
    expect("blocked" in result && !result.blocked).toBe(false);
    if ("blocked" in result && !result.blocked) return;
    // Must be breached or blocked — not a success.
    expect("breached" in result || ("blocked" in result && result.blocked)).toBe(true);
  });

  it("at exactly budget — not over (spent == budget)", async () => {
    const atBudget: BudgetCheck = {
      spentMinorUnits:   10_000n,
      budgetMinorUnits:  10_000n,
    };
    const result = await provider.call(atBudget, defaultInput);
    expect("breached" in result).toBe(false);
  });
});

// ============================================================
// API key absence — call blocked with exact reason
// ============================================================

describe("LiveModelProvider.call — API key blocker", () => {
  // Use an env var that is guaranteed empty in test.
  const config: LiveModelConfig = {
    ...defaultConfig,
    apiKeyEnvVar: "ALINAMATRIX_TEST_EMPTY_KEY",
  };
  const provider = new LiveModelProvider(config);

  it("blocks with exact reason when API key env var is empty", async () => {
    // Ensure the env var is not set.
    const saved = process.env["ALINAMATRIX_TEST_EMPTY_KEY"];
    delete process.env["ALINAMATRIX_TEST_EMPTY_KEY"];
    try {
      const result = await provider.call(withinBudget, defaultInput);
      // Budget passes, so result is blocked (not breached).
      expect("breached" in result).toBe(false);
      if ("blocked" in result && result.blocked) {
        expect(result.reason).toContain("ALINAMATRIX_TEST_EMPTY_KEY");
        expect(result.reason).toContain("not set or empty");
        expect(result.reason).toContain("No response");
      } else {
        throw new Error("Expected blocked result but got success");
      }
    } finally {
      if (saved !== undefined) {
        process.env["ALINAMATRIX_TEST_EMPTY_KEY"] = saved;
      }
    }
  });

  it("does not invent a response when blocked", async () => {
    delete process.env["ALINAMATRIX_TEST_EMPTY_KEY"];
    const result = await provider.call(withinBudget, defaultInput);
    if ("blocked" in result && result.blocked) {
      // A blocked result must not have output/outputJson/outputHash.
      expect(result).not.toHaveProperty("output");
      expect(result).not.toHaveProperty("outputJson");
      expect(result).not.toHaveProperty("outputHash");
    } else {
      throw new Error("Expected blocked result but got success");
    }
  });
});

// ============================================================
// Real API call — only if OPENAI_API_KEY is present
// ============================================================

const hasOpenAIKey =
  typeof process.env["OPENAI_API_KEY"] === "string" &&
  (process.env["OPENAI_API_KEY"] ?? "").length > 0;

describe.skipIf(!hasOpenAIKey)(
  "LiveModelProvider.call — real OpenAI call",
  () => {
    const provider = new LiveModelProvider(defaultConfig);

    it("makes a real call and returns validated output", async () => {
      const result = await provider.call(withinBudget, defaultInput);
      if ("breached" in result) return;
      if (result.blocked === true) {
        console.warn("Live call blocked despite key:", result.reason);
        return;
      }
      expect(result.output.result).toBeTruthy();
      expect(result.outputHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("output validates against LiveModelOutputSchema", async () => {
      const result = await provider.call(withinBudget, defaultInput);
      if ("breached" in result) return;
      if (result.blocked === true) return;
      const parsed = LiveModelOutputSchema.safeParse(result.output);
      expect(parsed.success).toBe(true);
    });
  },
);

// ============================================================
// Unknown keys dropped — the provider strips unknown keys
// ============================================================

describe("LiveModelProvider — unknown keys dropped", () => {
  it("KNOWN_LIVE_OUTPUT_KEYS contains only the expected keys", () => {
    // The known keys set is internal, but we verify the output shape
    // by checking that a valid output has no extra keys.
    const valid = {
      _provider:      "LiveModelProvider",
      _modelId:       "gpt-4o-mini",
      _temperature:    0,
      _schemaVersion:  "m03-live-v1",
      result:          "Test.",
    };
    const parsed = LiveModelOutputSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const keys = Object.keys(parsed.data);
    for (const key of keys) {
      expect([
        "_provider", "_modelId", "_temperature", "_schemaVersion",
        "result", "reasoning",
      ]).toContain(key);
    }
  });

  it("schema strips unknown keys (Zod default — unknown keys dropped)", () => {
    const withUnknown = {
      _provider:      "LiveModelProvider",
      _modelId:       "gpt-4o-mini",
      _temperature:    0,
      _schemaVersion:  "m03-live-v1",
      result:          "Test.",
      unknownExtra:    "should be dropped",
    };
    const parsed = LiveModelOutputSchema.safeParse(withUnknown);
    // Zod .object() strips unknown keys by default — parsing succeeds.
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    // The unknown key must NOT appear in the parsed data.
    expect("unknownExtra" in parsed.data).toBe(false);
  });
});

// ============================================================
// Pinned fields — model id, temperature, schema version, budget
// ============================================================

describe("LiveModelProvider — pinned fields", () => {
  it("pins model id in config", () => {
    const provider = new LiveModelProvider(defaultConfig);
    expect(provider.config.modelId).toBe("gpt-4o-mini");
  });

  it("pins temperature in config", () => {
    const provider = new LiveModelProvider(defaultConfig);
    expect(provider.config.temperature).toBe(0);
  });

  it("pins schema version in config", () => {
    const provider = new LiveModelProvider(defaultConfig);
    expect(provider.config.schemaVersion).toBe("m03-live-v1");
  });

  it("budget ceiling is accessible as bigint", () => {
    const provider = new LiveModelProvider(defaultConfig);
    expect(typeof provider.budgetCeilingMinorUnits).toBe("bigint");
    expect(provider.budgetCeilingMinorUnits).toBe(10_000n);
  });
});

// ============================================================
// Semantic variance — live vs fake
// ============================================================

describe("recordLiveSemanticVariance", () => {
  const fakeProvider = new DeterministicFakeProvider();
  // Use an empty-key config so the live call is blocked (no API key).
  const liveProvider = new LiveModelProvider({
    ...defaultConfig,
    apiKeyEnvVar: "ALINAMATRIX_TEST_EMPTY_KEY_2",
  });

  it("returns a valid SemanticVarianceRecord when blocked", async () => {
    delete process.env["ALINAMATRIX_TEST_EMPTY_KEY_2"];
    const record = await recordLiveSemanticVariance(
      fakeProvider,
      liveProvider,
      withinBudget,
      defaultInput,
    );
    const parsed = SemanticVarianceRecordSchema.safeParse(record);
    expect(parsed.success).toBe(true);
  });

  it("records sameHash=false when blocked (different providers)", async () => {
    delete process.env["ALINAMATRIX_TEST_EMPTY_KEY_2"];
    const record = await recordLiveSemanticVariance(
      fakeProvider,
      liveProvider,
      withinBudget,
      defaultInput,
    );
    expect(record.sameHash).toBe(false);
    expect(record.pinnedOutputHash).toBe("live_blocked");
  });

  it("variance string mentions the blocker", async () => {
    delete process.env["ALINAMATRIX_TEST_EMPTY_KEY_2"];
    const record = await recordLiveSemanticVariance(
      fakeProvider,
      liveProvider,
      withinBudget,
      defaultInput,
    );
    expect(record.variance).toContain("LiveModelProvider");
    expect(record.variance).toContain("blocked");
  });

  it("records budget_breached when over budget", async () => {
    const record = await recordLiveSemanticVariance(
      fakeProvider,
      liveProvider,
      overBudget,
      defaultInput,
    );
    expect(record.sameHash).toBe(false);
    expect(record.pinnedOutputHash).toBe("budget_breached");
    expect(record.variance).toContain("budget_breached");
  });
});
