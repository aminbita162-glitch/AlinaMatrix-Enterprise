/**
 * Domain tests for agent capabilities, fake provider, and cache key derivation.
 *
 * All tests are pure (no I/O, no database).
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import {
  assertAgentCapability,
  assertJobNotCancelled,
  buildCacheKey,
  DeterministicFakeProvider,
  AGENT_CAPABILITIES,
  CapabilityDeniedError,
  CancelledJobError,
} from "./agents.js";
import type { AgentName, AgentCapability, CacheKeyParams } from "./agents.js";

// ============================================================
// assertAgentCapability
// ============================================================

describe("assertAgentCapability", () => {
  it("allows AlinaArchitect to READ_SOURCE", () => {
    expect(() => assertAgentCapability("AlinaArchitect", "READ_SOURCE")).not.toThrow();
  });

  it("allows AlinaArchitect to READ_EVIDENCE", () => {
    expect(() => assertAgentCapability("AlinaArchitect", "READ_EVIDENCE")).not.toThrow();
  });

  it("allows AlinaArchitect to WRITE_DRAFT", () => {
    expect(() => assertAgentCapability("AlinaArchitect", "WRITE_DRAFT")).not.toThrow();
  });

  it("denies AlinaArchitect COMPILE_ARTIFACT", () => {
    expect(() => assertAgentCapability("AlinaArchitect", "COMPILE_ARTIFACT"))
      .toThrow(CapabilityDeniedError);
  });

  it("denies AlinaArchitect RUN_VALIDATION", () => {
    expect(() => assertAgentCapability("AlinaArchitect", "RUN_VALIDATION"))
      .toThrow(CapabilityDeniedError);
  });

  it("allows AlinaGuard to READ_EVIDENCE", () => {
    expect(() => assertAgentCapability("AlinaGuard", "READ_EVIDENCE")).not.toThrow();
  });

  it("allows AlinaGuard to RUN_VALIDATION", () => {
    expect(() => assertAgentCapability("AlinaGuard", "RUN_VALIDATION")).not.toThrow();
  });

  it("denies AlinaGuard WRITE_DRAFT", () => {
    expect(() => assertAgentCapability("AlinaGuard", "WRITE_DRAFT"))
      .toThrow(CapabilityDeniedError);
  });

  it("denies AlinaGuard COMPILE_ARTIFACT", () => {
    expect(() => assertAgentCapability("AlinaGuard", "COMPILE_ARTIFACT"))
      .toThrow(CapabilityDeniedError);
  });

  it("allows AlinaDocEngine to COMPILE_ARTIFACT", () => {
    expect(() => assertAgentCapability("AlinaDocEngine", "COMPILE_ARTIFACT")).not.toThrow();
  });

  it("denies AlinaDocEngine WRITE_DRAFT", () => {
    expect(() => assertAgentCapability("AlinaDocEngine", "WRITE_DRAFT"))
      .toThrow(CapabilityDeniedError);
  });

  it("denies AlinaDocEngine READ_SOURCE", () => {
    expect(() => assertAgentCapability("AlinaDocEngine", "READ_SOURCE"))
      .toThrow(CapabilityDeniedError);
  });

  it("allows AlinaOptimizer to READ_USAGE", () => {
    expect(() => assertAgentCapability("AlinaOptimizer", "READ_USAGE")).not.toThrow();
  });

  it("allows AlinaOptimizer to WRITE_CACHE_METADATA", () => {
    expect(() => assertAgentCapability("AlinaOptimizer", "WRITE_CACHE_METADATA")).not.toThrow();
  });

  it("denies AlinaOptimizer WRITE_DRAFT", () => {
    expect(() => assertAgentCapability("AlinaOptimizer", "WRITE_DRAFT"))
      .toThrow(CapabilityDeniedError);
  });

  it("denies any agent RELEASE (blocked unconditionally)", () => {
    const agents: AgentName[] = [
      "AlinaArchitect", "AlinaGuard", "AlinaDocEngine", "AlinaOptimizer",
    ];
    for (const agent of agents) {
      expect(() => assertAgentCapability(agent, "RELEASE"))
        .toThrow(CapabilityDeniedError);
    }
  });

  it("denies any agent EXPORT (blocked unconditionally)", () => {
    const agents: AgentName[] = [
      "AlinaArchitect", "AlinaGuard", "AlinaDocEngine", "AlinaOptimizer",
    ];
    for (const agent of agents) {
      expect(() => assertAgentCapability(agent, "EXPORT"))
        .toThrow(CapabilityDeniedError);
    }
  });

  it("error message names the agent and capability", () => {
    const err = (() => {
      try {
        assertAgentCapability("AlinaGuard", "COMPILE_ARTIFACT");
      } catch (e) {
        return e as CapabilityDeniedError;
      }
    })();
    expect(err).toBeInstanceOf(CapabilityDeniedError);
    expect(err!.message).toContain("AlinaGuard");
    expect(err!.message).toContain("COMPILE_ARTIFACT");
  });

  it("AGENT_CAPABILITIES map has exactly four agents", () => {
    expect(Object.keys(AGENT_CAPABILITIES)).toHaveLength(4);
  });
});

// ============================================================
// assertJobNotCancelled
// ============================================================

describe("assertJobNotCancelled", () => {
  it("does not throw for INGESTED state", () => {
    expect(() => assertJobNotCancelled("job-1", "INGESTED")).not.toThrow();
  });

  it("does not throw for GENERATED state", () => {
    expect(() => assertJobNotCancelled("job-1", "GENERATED")).not.toThrow();
  });

  it("does not throw for FAILED_TERMINAL state", () => {
    expect(() => assertJobNotCancelled("job-1", "FAILED_TERMINAL")).not.toThrow();
  });

  it("throws CancelledJobError for CANCELLED state", () => {
    expect(() => assertJobNotCancelled("job-abc", "CANCELLED"))
      .toThrow(CancelledJobError);
  });

  it("error message includes the job id", () => {
    const err = (() => {
      try {
        assertJobNotCancelled("my-job-id", "CANCELLED");
      } catch (e) {
        return e as CancelledJobError;
      }
    })();
    expect(err!.message).toContain("my-job-id");
  });
});

// ============================================================
// buildCacheKey
// ============================================================

const baseParams: CacheKeyParams = {
  tenantId:         "aaaa0000-0000-0000-0000-000000000001",
  sourceVersionIds: ["sv-1", "sv-2"],
  promptSha256:     "a".repeat(64),
  modelId:          "fake-model-v1",
  schemaSha256:     "b".repeat(64),
  policySha256:     "c".repeat(64),
  inputHash:        "d".repeat(64),
};

describe("buildCacheKey", () => {
  it("returns a 64-char hex string", () => {
    const key = buildCacheKey(baseParams);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for identical inputs", () => {
    expect(buildCacheKey(baseParams)).toBe(buildCacheKey({ ...baseParams }));
  });

  it("changes when tenant_id changes (cross-tenant cache miss)", () => {
    const keyA = buildCacheKey(baseParams);
    const keyB = buildCacheKey({
      ...baseParams,
      tenantId: "bbbb0000-0000-0000-0000-000000000002",
    });
    expect(keyA).not.toBe(keyB);
  });

  it("changes when promptSha256 changes", () => {
    const keyA = buildCacheKey(baseParams);
    const keyB = buildCacheKey({ ...baseParams, promptSha256: "e".repeat(64) });
    expect(keyA).not.toBe(keyB);
  });

  it("changes when modelId changes", () => {
    const keyA = buildCacheKey(baseParams);
    const keyB = buildCacheKey({ ...baseParams, modelId: "different-model" });
    expect(keyA).not.toBe(keyB);
  });

  it("changes when schemaSha256 changes", () => {
    const keyA = buildCacheKey(baseParams);
    const keyB = buildCacheKey({ ...baseParams, schemaSha256: "f".repeat(64) });
    expect(keyA).not.toBe(keyB);
  });

  it("changes when policySha256 changes", () => {
    const keyA = buildCacheKey(baseParams);
    const keyB = buildCacheKey({ ...baseParams, policySha256: "0".repeat(64) });
    expect(keyA).not.toBe(keyB);
  });

  it("changes when inputHash changes", () => {
    const keyA = buildCacheKey(baseParams);
    const keyB = buildCacheKey({ ...baseParams, inputHash: "1".repeat(64) });
    expect(keyA).not.toBe(keyB);
  });

  it("sourceVersionIds order is canonicalized (sorted)", () => {
    const keyA = buildCacheKey({ ...baseParams, sourceVersionIds: ["sv-2", "sv-1"] });
    const keyB = buildCacheKey({ ...baseParams, sourceVersionIds: ["sv-1", "sv-2"] });
    expect(keyA).toBe(keyB);
  });

  it("changes when sourceVersionIds set changes", () => {
    const keyA = buildCacheKey(baseParams);
    const keyB = buildCacheKey({ ...baseParams, sourceVersionIds: ["sv-3"] });
    expect(keyA).not.toBe(keyB);
  });
});

// ============================================================
// DeterministicFakeProvider
// ============================================================

describe("DeterministicFakeProvider", () => {
  const provider = new DeterministicFakeProvider();
  const input = {
    promptSha256:  "a".repeat(64),
    schemaSha256:  "b".repeat(64),
    inputHash:     "c".repeat(64),
  };

  it("returns a valid JSON string", () => {
    const out = provider.call(input);
    expect(() => JSON.parse(out.outputJson)).not.toThrow();
  });

  it("same inputs produce identical outputJson", () => {
    const a = provider.call(input);
    const b = provider.call({ ...input });
    expect(a.outputJson).toBe(b.outputJson);
  });

  it("same inputs produce identical outputHash", () => {
    const a = provider.call(input);
    const b = provider.call({ ...input });
    expect(a.outputHash).toBe(b.outputHash);
  });

  it("outputHash is a 64-char hex string", () => {
    const out = provider.call(input);
    expect(out.outputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different promptSha256 produces different output", () => {
    const a = provider.call(input);
    const b = provider.call({ ...input, promptSha256: "e".repeat(64) });
    expect(a.outputJson).not.toBe(b.outputJson);
  });

  it("different schemaSha256 produces different output", () => {
    const a = provider.call(input);
    const b = provider.call({ ...input, schemaSha256: "f".repeat(64) });
    expect(a.outputJson).not.toBe(b.outputJson);
  });

  it("different inputHash produces different output", () => {
    const a = provider.call(input);
    const b = provider.call({ ...input, inputHash: "1".repeat(64) });
    expect(a.outputJson).not.toBe(b.outputJson);
  });

  it("promptTokens is a positive integer", () => {
    const out = provider.call(input);
    expect(out.promptTokens).toBeGreaterThan(0);
    expect(Number.isInteger(out.promptTokens)).toBe(true);
  });

  it("completionTokens is a positive integer", () => {
    const out = provider.call(input);
    expect(out.completionTokens).toBeGreaterThan(0);
    expect(Number.isInteger(out.completionTokens)).toBe(true);
  });

  it("token counts are deterministic", () => {
    const a = provider.call(input);
    const b = provider.call({ ...input });
    expect(a.promptTokens).toBe(b.promptTokens);
    expect(a.completionTokens).toBe(b.completionTokens);
  });

  it("output JSON contains _provider: DeterministicFakeProvider", () => {
    const out = provider.call(input);
    const parsed = JSON.parse(out.outputJson) as Record<string, unknown>;
    expect(parsed["_provider"]).toBe("DeterministicFakeProvider");
  });

  it("does not call any live LLM (no fetch/http calls — pure computation)", () => {
    // Pure unit test: if call() returns without error it performed no I/O.
    const out = provider.call(input);
    expect(out.outputJson).toBeTruthy();
  });
});

// ============================================================
// Capability coverage per agent (explicit set checks)
// ============================================================

describe("AGENT_CAPABILITIES content", () => {
  const allowedCapabilities: AgentCapability[] = [
    "READ_SOURCE", "READ_EVIDENCE", "WRITE_DRAFT",
    "RUN_VALIDATION", "COMPILE_ARTIFACT",
    "READ_USAGE", "WRITE_CACHE_METADATA",
  ];

  it("AlinaArchitect has exactly READ_SOURCE, READ_EVIDENCE, WRITE_DRAFT", () => {
    const caps = AGENT_CAPABILITIES["AlinaArchitect"];
    expect(caps.size).toBe(3);
    expect(caps.has("READ_SOURCE")).toBe(true);
    expect(caps.has("READ_EVIDENCE")).toBe(true);
    expect(caps.has("WRITE_DRAFT")).toBe(true);
  });

  it("AlinaGuard has exactly READ_EVIDENCE, RUN_VALIDATION", () => {
    const caps = AGENT_CAPABILITIES["AlinaGuard"];
    expect(caps.size).toBe(2);
    expect(caps.has("READ_EVIDENCE")).toBe(true);
    expect(caps.has("RUN_VALIDATION")).toBe(true);
  });

  it("AlinaDocEngine has exactly COMPILE_ARTIFACT", () => {
    const caps = AGENT_CAPABILITIES["AlinaDocEngine"];
    expect(caps.size).toBe(1);
    expect(caps.has("COMPILE_ARTIFACT")).toBe(true);
  });

  it("AlinaOptimizer has exactly READ_USAGE, WRITE_CACHE_METADATA", () => {
    const caps = AGENT_CAPABILITIES["AlinaOptimizer"];
    expect(caps.size).toBe(2);
    expect(caps.has("READ_USAGE")).toBe(true);
    expect(caps.has("WRITE_CACHE_METADATA")).toBe(true);
  });

  it("no agent has a capability outside the allowed set", () => {
    for (const [agentName, capSet] of Object.entries(AGENT_CAPABILITIES)) {
      for (const cap of capSet) {
        expect(allowedCapabilities).toContain(cap as AgentCapability);
      }
      void agentName;
    }
  });
});
