/**
 * Tests for packages/domain/src/generate.ts
 *
 * Covers:
 *   - Claim ID validation: unknown claim is rejected
 *   - Claim ID validation: all allowed claims pass
 *   - State transition: ARCHITECTED → GENERATED is legal
 *   - State transition: other states are rejected
 *   - Determinism: same inputs → same draftHash
 *   - Claim order independence: sorted claim IDs produce same draftHash
 *   - Different requestedClaimIds produce different draftHash
 *   - Different planHash produces different draftHash
 *   - nextState is always GENERATED
 *   - embeddedClaimIds matches requestedClaimIds
 *   - Token counts are positive integers
 *   - Empty requestedClaimIds allowed (no claims embedded)
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  runGenerate,
  assertClaimIdsExist,
  UnknownClaimError,
  type GenerateInput,
} from "./generate.js";
import { IllegalTransitionError } from "./workflow.js";

// ============================================================
// Helpers
// ============================================================

function makeUuid(): string {
  return "00000000-0000-4000-8000-" + Math.random().toString(16).slice(2, 14).padEnd(12, "0");
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function baseInput(overrides: Partial<GenerateInput> = {}): GenerateInput {
  const claimA = makeUuid();
  const claimB = makeUuid();
  return {
    tenantId:          makeUuid(),
    projectId:         makeUuid(),
    workflowRunId:     makeUuid(),
    currentState:      "ARCHITECTED",
    planHash:          sha256("plan-v1"),
    allowedClaimIds:   new Set([claimA, claimB]),
    requestedClaimIds: [claimA],
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
    ...overrides,
  };
}

// ============================================================
// assertClaimIdsExist
// ============================================================

describe("assertClaimIdsExist", () => {
  it("passes when all requested IDs are in the allowed set", () => {
    const a = makeUuid();
    const b = makeUuid();
    expect(() => assertClaimIdsExist([a, b], new Set([a, b]))).not.toThrow();
  });

  it("throws UnknownClaimError for an ID not in the allowed set", () => {
    const unknown = makeUuid();
    expect(() => assertClaimIdsExist([unknown], new Set())).toThrow(UnknownClaimError);
  });

  it("error message contains the offending claim ID", () => {
    const unknown = makeUuid();
    try {
      assertClaimIdsExist([unknown], new Set());
    } catch (err) {
      expect((err as Error).message).toContain(unknown);
    }
  });

  it("passes for an empty requested list", () => {
    expect(() => assertClaimIdsExist([], new Set([makeUuid()]))).not.toThrow();
  });

  it("fails on the first unknown ID when multiple are provided", () => {
    const known = makeUuid();
    const unknown = makeUuid();
    expect(() => assertClaimIdsExist([known, unknown], new Set([known]))).toThrow(UnknownClaimError);
  });

  it("a partial superset of allowed IDs passes", () => {
    const a = makeUuid();
    const b = makeUuid();
    const c = makeUuid();
    // allowed = {a, b, c}, requested = {a, b} — should pass
    expect(() => assertClaimIdsExist([a, b], new Set([a, b, c]))).not.toThrow();
  });
});

// ============================================================
// runGenerate — state transition guard
// ============================================================

describe("runGenerate — state transition", () => {
  it("succeeds from ARCHITECTED → GENERATED", () => {
    const r = runGenerate(baseInput());
    expect(r.nextState).toBe("GENERATED");
  });

  it("rejects EVIDENCE_READY → GENERATED (illegal)", () => {
    expect(() =>
      runGenerate(baseInput({ currentState: "EVIDENCE_READY" })),
    ).toThrow(IllegalTransitionError);
  });

  it("rejects INGESTED → GENERATED (illegal)", () => {
    expect(() =>
      runGenerate(baseInput({ currentState: "INGESTED" })),
    ).toThrow(IllegalTransitionError);
  });

  it("rejects GENERATED → GENERATED (same state, illegal)", () => {
    expect(() =>
      runGenerate(baseInput({ currentState: "GENERATED" })),
    ).toThrow(IllegalTransitionError);
  });

  it("rejects NEEDS_REVIEW → GENERATED (illegal)", () => {
    expect(() =>
      runGenerate(baseInput({ currentState: "NEEDS_REVIEW" })),
    ).toThrow(IllegalTransitionError);
  });
});

// ============================================================
// runGenerate — claim ID validation
// ============================================================

describe("runGenerate — claim ID validation", () => {
  it("rejects a claim ID not in allowedClaimIds", () => {
    const unknownId = makeUuid();
    expect(() =>
      runGenerate(baseInput({ requestedClaimIds: [unknownId] })),
    ).toThrow(UnknownClaimError);
  });

  it("succeeds with all claim IDs in allowedClaimIds", () => {
    const claimA = makeUuid();
    const claimB = makeUuid();
    expect(() =>
      runGenerate(baseInput({
        allowedClaimIds:   new Set([claimA, claimB]),
        requestedClaimIds: [claimA, claimB],
      })),
    ).not.toThrow();
  });

  it("succeeds with an empty requestedClaimIds list", () => {
    expect(() =>
      runGenerate(baseInput({ requestedClaimIds: [] })),
    ).not.toThrow();
  });

  it("embeddedClaimIds in result matches requestedClaimIds", () => {
    const claimA = makeUuid();
    const r = runGenerate(baseInput({
      allowedClaimIds:   new Set([claimA]),
      requestedClaimIds: [claimA],
    }));
    expect(r.embeddedClaimIds).toContain(claimA);
    expect(r.embeddedClaimIds).toHaveLength(1);
  });
});

// ============================================================
// runGenerate — determinism
// ============================================================

describe("runGenerate — determinism", () => {
  it("same inputs produce the same draftHash on two calls", () => {
    const input = baseInput();
    const r1 = runGenerate(input);
    const r2 = runGenerate(input);
    expect(r1.draftHash).toBe(r2.draftHash);
  });

  it("same inputs produce the same outputJson", () => {
    const input = baseInput();
    expect(runGenerate(input).outputJson).toBe(runGenerate(input).outputJson);
  });

  it("claim ID order does not affect draftHash (sorted internally)", () => {
    const claimA = makeUuid();
    const claimB = makeUuid();
    const allowedClaimIds = new Set([claimA, claimB]);
    // Use the same fixed input object, only swapping the order of requestedClaimIds.
    const shared = baseInput({ allowedClaimIds, requestedClaimIds: [claimA, claimB] });
    const r1 = runGenerate(shared);
    const r2 = runGenerate({ ...shared, requestedClaimIds: [claimB, claimA] });
    expect(r1.draftHash).toBe(r2.draftHash);
  });

  it("different planHash produces different draftHash", () => {
    const shared = baseInput({ planHash: sha256("plan-v1") });
    const r1 = runGenerate(shared);
    const r2 = runGenerate({ ...shared, planHash: sha256("plan-v2") });
    expect(r1.draftHash).not.toBe(r2.draftHash);
  });

  it("different requestedClaimIds produce different draftHash", () => {
    const claimA = makeUuid();
    const claimB = makeUuid();
    const allowed = new Set([claimA, claimB]);
    const shared = baseInput({ allowedClaimIds: allowed, requestedClaimIds: [claimA] });
    const r1 = runGenerate(shared);
    const r2 = runGenerate({ ...shared, requestedClaimIds: [claimB] });
    expect(r1.draftHash).not.toBe(r2.draftHash);
  });

  it("draftHash is a 64-character hex string", () => {
    const r = runGenerate(baseInput());
    expect(r.draftHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ============================================================
// runGenerate — output shape
// ============================================================

describe("runGenerate — output shape", () => {
  it("nextState is GENERATED", () => {
    expect(runGenerate(baseInput()).nextState).toBe("GENERATED");
  });

  it("promptTokens is a positive integer", () => {
    const r = runGenerate(baseInput());
    expect(Number.isInteger(r.promptTokens)).toBe(true);
    expect(r.promptTokens).toBeGreaterThan(0);
  });

  it("completionTokens is a positive integer", () => {
    const r = runGenerate(baseInput());
    expect(Number.isInteger(r.completionTokens)).toBe(true);
    expect(r.completionTokens).toBeGreaterThan(0);
  });

  it("outputJson is valid JSON", () => {
    const r = runGenerate(baseInput());
    expect(() => JSON.parse(r.outputJson)).not.toThrow();
  });
});
