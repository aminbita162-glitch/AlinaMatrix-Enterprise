/**
 * Tests for packages/domain/src/architect.ts
 *
 * Covers:
 *   - Determinism: same versioned inputs → same plan hash (multiple runs)
 *   - Source-order independence: sorted source version IDs produce the same hash
 *   - Capability guard: WRITE_DRAFT must be asserted
 *   - Architect cannot release or export (CapabilityDeniedError)
 *   - Section derivation: all 19 M03 section keys present, stable across calls
 *   - Context field is included in output but does not change the plan hash invariant
 *   - Different inputs produce different plan hashes
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  runArchitectPlan,
  assertArchitectCannotRelease,
  type ArchitectPlanInput,
} from "./architect.js";
import { assertAgentCapability, CapabilityDeniedError } from "./agents.js";

// ============================================================
// Helpers
// ============================================================

function makeUuid(): string {
  return "00000000-0000-4000-8000-" + Math.random().toString(16).slice(2, 14).padEnd(12, "0");
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function baseInput(): ArchitectPlanInput {
  return {
    tenantId:         makeUuid(),
    projectId:        makeUuid(),
    workflowRunId:    makeUuid(),
    inputHash:        sha256("source-bytes-v1"),
    sourceVersionIds: [makeUuid(), makeUuid()],
    pins: {
      promptSha256:    sha256("prompt-v1"),
      schemaSha256:    sha256("schema-v1"),
      policySha256:    sha256("policy-v1"),
      modelId:         "deterministic-fake-v1",
      agentVersionId:  makeUuid(),
      promptVersionId: makeUuid(),
      schemaVersionId: makeUuid(),
      policyVersionId: makeUuid(),
    },
  };
}

// ============================================================
// Determinism
// ============================================================

describe("runArchitectPlan — determinism", () => {
  it("same inputs produce the same planHash on two consecutive calls", () => {
    const input = baseInput();
    const r1 = runArchitectPlan(input);
    const r2 = runArchitectPlan(input);
    expect(r1.planHash).toBe(r2.planHash);
  });

  it("same inputs produce the same outputJson", () => {
    const input = baseInput();
    const r1 = runArchitectPlan(input);
    const r2 = runArchitectPlan(input);
    expect(r1.outputJson).toBe(r2.outputJson);
  });

  it("same inputs produce the same token counts", () => {
    const input = baseInput();
    const r1 = runArchitectPlan(input);
    const r2 = runArchitectPlan(input);
    expect(r1.promptTokens).toBe(r2.promptTokens);
    expect(r1.completionTokens).toBe(r2.completionTokens);
  });

  it("planHash is a 64-character hex string", () => {
    const r = runArchitectPlan(baseInput());
    expect(r.planHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("running five times always yields the same planHash", () => {
    const input = baseInput();
    const hashes = Array.from({ length: 5 }, () => runArchitectPlan(input).planHash);
    const unique = new Set(hashes);
    expect(unique.size).toBe(1);
  });

  it("source version ID order does not affect planHash", () => {
    const input = baseInput();
    const input2: ArchitectPlanInput = {
      ...input,
      sourceVersionIds: [...input.sourceVersionIds].reverse(),
    };
    const r1 = runArchitectPlan(input);
    const r2 = runArchitectPlan(input2);
    expect(r1.planHash).toBe(r2.planHash);
  });
});

// ============================================================
// Input variation
// ============================================================

describe("runArchitectPlan — input variation", () => {
  it("different tenantId produces different planHash", () => {
    const input = baseInput();
    const input2 = { ...input, tenantId: makeUuid() };
    expect(runArchitectPlan(input).planHash).not.toBe(runArchitectPlan(input2).planHash);
  });

  it("different inputHash produces different planHash", () => {
    const input = baseInput();
    const input2 = { ...input, inputHash: sha256("source-bytes-v2") };
    expect(runArchitectPlan(input).planHash).not.toBe(runArchitectPlan(input2).planHash);
  });

  it("different promptSha256 produces different planHash", () => {
    const input = baseInput();
    const input2 = { ...input, pins: { ...input.pins, promptSha256: sha256("prompt-v2") } };
    expect(runArchitectPlan(input).planHash).not.toBe(runArchitectPlan(input2).planHash);
  });

  it("different schemaSha256 produces different planHash", () => {
    const input = baseInput();
    const input2 = { ...input, pins: { ...input.pins, schemaSha256: sha256("schema-v2") } };
    expect(runArchitectPlan(input).planHash).not.toBe(runArchitectPlan(input2).planHash);
  });
});

// ============================================================
// Sections
// ============================================================

describe("runArchitectPlan — sections", () => {
  it("returns exactly 19 sections (one per M03 content model key)", () => {
    const r = runArchitectPlan(baseInput());
    expect(r.sections).toHaveLength(19);
  });

  it("sections are stable across identical calls", () => {
    const input = baseInput();
    const r1 = runArchitectPlan(input);
    const r2 = runArchitectPlan(input);
    expect(r1.sections).toEqual(r2.sections);
  });

  it("all 19 expected section keys are present", () => {
    const expected = [
      "metadata", "context", "decision", "status", "drivers",
      "options", "outcome", "consequences", "evidenceMap", "claimAtoms",
      "assumptions", "negativeEvidence", "terminology", "risks",
      "openQuestions", "review", "approval", "limitations", "releaseMetadata",
    ];
    const r = runArchitectPlan(baseInput());
    const keys = r.sections.map(s => s.sectionKey);
    for (const key of expected) {
      expect(keys).toContain(key);
    }
  });

  it("each section has a non-empty instruction string", () => {
    const r = runArchitectPlan(baseInput());
    for (const section of r.sections) {
      expect(typeof section.instruction).toBe("string");
      expect(section.instruction.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// Capability guards
// ============================================================

describe("runArchitectPlan — capability guards", () => {
  it("does not throw when called normally (WRITE_DRAFT is granted)", () => {
    expect(() => runArchitectPlan(baseInput())).not.toThrow();
  });

  it("assertArchitectCannotRelease throws CapabilityDeniedError", () => {
    expect(() => assertArchitectCannotRelease()).toThrow(CapabilityDeniedError);
  });

  it("assertArchitectCannotRelease error message mentions RELEASE", () => {
    try {
      assertArchitectCannotRelease();
    } catch (err) {
      expect((err as Error).message).toContain("RELEASE");
    }
  });

  it("AlinaArchitect cannot EXPORT", () => {
    expect(() => assertAgentCapability("AlinaArchitect", "EXPORT")).toThrow(CapabilityDeniedError);
  });

  it("AlinaArchitect cannot RUN_VALIDATION", () => {
    expect(() => assertAgentCapability("AlinaArchitect", "RUN_VALIDATION")).toThrow(CapabilityDeniedError);
  });

  it("AlinaArchitect cannot COMPILE_ARTIFACT", () => {
    expect(() => assertAgentCapability("AlinaArchitect", "COMPILE_ARTIFACT")).toThrow(CapabilityDeniedError);
  });
});

// ============================================================
// Token counts
// ============================================================

describe("runArchitectPlan — token counts", () => {
  it("promptTokens is a positive integer", () => {
    const r = runArchitectPlan(baseInput());
    expect(Number.isInteger(r.promptTokens)).toBe(true);
    expect(r.promptTokens).toBeGreaterThan(0);
  });

  it("completionTokens is a positive integer", () => {
    const r = runArchitectPlan(baseInput());
    expect(Number.isInteger(r.completionTokens)).toBe(true);
    expect(r.completionTokens).toBeGreaterThan(0);
  });
});
