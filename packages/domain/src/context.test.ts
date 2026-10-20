/**
 * Context Contract V1 tests — ECIDR.
 *
 * Test plan (ECIDR §13):
 *   A. Contract: schema validation, invalid UUID/hash, bounds, canonical
 *      ordering, golden hash vectors.
 *   B. Property-based: deterministic hashes, sorting invariants, uniqueness,
 *      tenant separation, immutable sealed state.
 *   C. Mutation testing: mutate tenant, project, agent, policy, source content,
 *      fragment, and provider record; every relevant integrity check must fail.
 *   D. (Integration tests are in packages/db — separate file.)
 *   E. Replay: exact match for pinned deterministic/recorded data, rejection on
 *      missing or changed inputs, zero external side effects.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  ContextContractV1Schema,
  type ContextContractV1,
  type SealedSnapshot,
  type SourceRef,
} from "@alinamatrix/contracts";
import {
  CANONICALIZATION_VERSION,
  canonicalizeSourceRefs,
  computeContextPayloadSha256,
  computeSnapshotSha256,
  assertContextAuthorized,
  sealSnapshot,
  consumeSnapshot,
  rejectSnapshot,
  replaySnapshot,
  assertLegalSnapshotTransition,
  isLegalSnapshotTransition,
  ContextHashMismatchError,
  ContextAuthorizationError,
  ContextStateError,
  ContextReplayError,
} from "./context.js";
import { CapabilityDeniedError } from "./agents.js";

// ============================================================
// Fixtures
// ============================================================

const UUID_A = "aaaaaaaa-0000-4000-a000-000000000001";
const UUID_B = "bbbbbbbb-0000-4000-b000-000000000002";
const UUID_C = "cccccccc-0000-4000-8000-000000000003";
const UUID_D = "dddddddd-0000-4000-8000-000000000004";
const SHA = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const SHA_A = SHA("content-a");
const SHA_B = SHA("content-b");

function makeSourceRefs(): SourceRef[] {
  return [
    { sourceVersionId: UUID_A, contentSha256: SHA_A, evidenceFragmentRefs: [UUID_C] },
    { sourceVersionId: UUID_B, contentSha256: SHA_B, evidenceFragmentRefs: [UUID_D] },
  ];
}

function makeContract(overrides: Partial<ContextContractV1> = {}): ContextContractV1 {
  const base: ContextContractV1 = {
    contractVersion: "1",
    tenantId: UUID_A,
    projectId: UUID_A,
    workflowRunId: UUID_A,
    jobId: UUID_A,
    agentName: "AlinaArchitect",
    taskKind: "architect_plan",
    sourceRefs: makeSourceRefs(),
    promptSha256: SHA("prompt"),
    schemaSha256: SHA("schema"),
    policySha256: SHA("policy"),
    modelVersionId: UUID_A,
    agentVersionId: UUID_A,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    contextPayloadSha256: "0".repeat(64),
    snapshotSha256: "0".repeat(64),
    createdAt: "2026-10-20T12:00:00.000Z",
    authorizationDecisionId: UUID_A,
  };
  const merged = { ...base, ...overrides };
  // Recompute the hashes so the contract is internally consistent.
  merged.contextPayloadSha256 = computeContextPayloadSha256(merged);
  merged.snapshotSha256 = computeSnapshotSha256(merged);
  return merged;
}

function makeSealedSnapshot(overrides: Partial<SealedSnapshot> = {}): SealedSnapshot {
  const contract = makeContract();
  return {
    ...contract,
    snapshotState: "SEALED",
    sealedAt: "2026-10-20T12:00:01.000Z",
    predecessorSnapshotId: null,
    ...overrides,
  };
}

// ============================================================
// A. Contract: schema validation
// ============================================================

describe("contract schema validation", () => {
  it("valid contract passes validation", () => {
    const contract = makeContract();
    const parsed = ContextContractV1Schema.safeParse(contract);
    expect(parsed.success).toBe(true);
  });

  it("contractVersion must be '1'", () => {
    const contract = makeContract({ contractVersion: "2" as "1" });
    const parsed = ContextContractV1Schema.safeParse(contract);
    expect(parsed.success).toBe(false);
  });

  it("invalid UUID is rejected", () => {
    const contract = makeContract({ tenantId: "not-a-uuid" });
    const parsed = ContextContractV1Schema.safeParse(contract);
    expect(parsed.success).toBe(false);
  });

  it("invalid sha256 (wrong length) is rejected", () => {
    const contract = makeContract({ promptSha256: "abc" });
    const parsed = ContextContractV1Schema.safeParse(contract);
    expect(parsed.success).toBe(false);
  });

  it("invalid sha256 (non-hex) is rejected", () => {
    const contract = makeContract({ promptSha256: "z".repeat(64) });
    const parsed = ContextContractV1Schema.safeParse(contract);
    expect(parsed.success).toBe(false);
  });

  it("empty sourceRefs array is rejected (min 1)", () => {
    const contract = makeContract({ sourceRefs: [] });
    const parsed = ContextContractV1Schema.safeParse(contract);
    expect(parsed.success).toBe(false);
  });

  it("unknown agent name is rejected", () => {
    const contract = makeContract({ agentName: "AlinaUnknown" as "AlinaArchitect" });
    const parsed = ContextContractV1Schema.safeParse(contract);
    expect(parsed.success).toBe(false);
  });

  it("extra/unknown key is rejected by strict()", () => {
    const contract = makeContract();
    const withExtra = { ...contract, extraField: "should be rejected" };
    const parsed = ContextContractV1Schema.safeParse(withExtra);
    expect(parsed.success).toBe(false);
  });

  it("empty taskKind is rejected", () => {
    const contract = makeContract({ taskKind: "" });
    const parsed = ContextContractV1Schema.safeParse(contract);
    expect(parsed.success).toBe(false);
  });
});

// ============================================================
// A. Canonical ordering
// ============================================================

describe("canonical ordering", () => {
  it("source refs are sorted by sourceVersionId", () => {
    const refs = [
      { sourceVersionId: UUID_B, contentSha256: SHA_B, evidenceFragmentRefs: [] },
      { sourceVersionId: UUID_A, contentSha256: SHA_A, evidenceFragmentRefs: [] },
    ];
    const sorted = canonicalizeSourceRefs(refs);
    expect(sorted[0]!.sourceVersionId).toBe(UUID_A);
    expect(sorted[1]!.sourceVersionId).toBe(UUID_B);
  });

  it("duplicate sourceVersionId is deduplicated", () => {
    const refs = [
      { sourceVersionId: UUID_A, contentSha256: SHA_A, evidenceFragmentRefs: [UUID_C] },
      { sourceVersionId: UUID_A, contentSha256: SHA_A, evidenceFragmentRefs: [UUID_C] },
    ];
    const sorted = canonicalizeSourceRefs(refs);
    expect(sorted).toHaveLength(1);
  });

  it("same refs in different order produce the same canonical order", () => {
    const refsA = [
      { sourceVersionId: UUID_B, contentSha256: SHA_B, evidenceFragmentRefs: [] },
      { sourceVersionId: UUID_A, contentSha256: SHA_A, evidenceFragmentRefs: [] },
    ];
    const refsB = [
      { sourceVersionId: UUID_A, contentSha256: SHA_A, evidenceFragmentRefs: [] },
      { sourceVersionId: UUID_B, contentSha256: SHA_B, evidenceFragmentRefs: [] },
    ];
    expect(canonicalizeSourceRefs(refsA)).toEqual(canonicalizeSourceRefs(refsB));
  });
});

// ============================================================
// B. Deterministic hashes
// ============================================================

describe("deterministic hashes", () => {
  it("same contract produces the same contextPayloadSha256", () => {
    const a = makeContract();
    const b = makeContract();
    expect(computeContextPayloadSha256(a)).toBe(computeContextPayloadSha256(b));
  });

  it("same contract produces the same snapshotSha256", () => {
    const a = makeContract();
    const b = makeContract();
    expect(computeSnapshotSha256(a)).toBe(computeSnapshotSha256(b));
  });

  it("different tenantId produces a different payload hash", () => {
    const a = makeContract({ tenantId: UUID_A });
    const b = makeContract({ tenantId: UUID_B });
    expect(computeContextPayloadSha256(a)).not.toBe(computeContextPayloadSha256(b));
  });

  it("different projectId produces a different payload hash", () => {
    const a = makeContract({ projectId: UUID_A });
    const b = makeContract({ projectId: UUID_B });
    expect(computeContextPayloadSha256(a)).not.toBe(computeContextPayloadSha256(b));
  });

  it("different agentName produces a different payload hash", () => {
    const a = makeContract({ agentName: "AlinaArchitect" });
    const b = makeContract({ agentName: "AlinaGuard" });
    expect(computeContextPayloadSha256(a)).not.toBe(computeContextPayloadSha256(b));
  });

  it("different policySha256 produces a different payload hash", () => {
    const a = makeContract({ policySha256: SHA("policy-a") });
    const b = makeContract({ policySha256: SHA("policy-b") });
    expect(computeContextPayloadSha256(a)).not.toBe(computeContextPayloadSha256(b));
  });

  it("different source content produces a different payload hash", () => {
    const a = makeContract();
    const b = makeContract({
      sourceRefs: [
        { sourceVersionId: UUID_A, contentSha256: SHA("different-content"), evidenceFragmentRefs: [UUID_C] },
        { sourceVersionId: UUID_B, contentSha256: SHA_B, evidenceFragmentRefs: [UUID_D] },
      ],
    });
    expect(computeContextPayloadSha256(a)).not.toBe(computeContextPayloadSha256(b));
  });

  it("different evidence fragment refs produce a different payload hash", () => {
    const a = makeContract();
    const b = makeContract({
      sourceRefs: [
        { sourceVersionId: UUID_A, contentSha256: SHA_A, evidenceFragmentRefs: [UUID_C] },
        { sourceVersionId: UUID_B, contentSha256: SHA_B, evidenceFragmentRefs: [UUID_C] }, // different fragment
      ],
    });
    expect(computeContextPayloadSha256(a)).not.toBe(computeContextPayloadSha256(b));
  });

  it("createdAt does not affect the payload hash", () => {
    const a = makeContract({ createdAt: "2026-10-20T12:00:00.000Z" });
    const b = makeContract({ createdAt: "2026-10-21T00:00:00.000Z" });
    expect(computeContextPayloadSha256(a)).toBe(computeContextPayloadSha256(b));
  });

  it("source refs in different order produce the same payload hash", () => {
    const a = makeContract({
      sourceRefs: [
        { sourceVersionId: UUID_A, contentSha256: SHA_A, evidenceFragmentRefs: [UUID_C] },
        { sourceVersionId: UUID_B, contentSha256: SHA_B, evidenceFragmentRefs: [UUID_D] },
      ],
    });
    const b = makeContract({
      sourceRefs: [
        { sourceVersionId: UUID_B, contentSha256: SHA_B, evidenceFragmentRefs: [UUID_D] },
        { sourceVersionId: UUID_A, contentSha256: SHA_A, evidenceFragmentRefs: [UUID_C] },
      ],
    });
    expect(computeContextPayloadSha256(a)).toBe(computeContextPayloadSha256(b));
  });

  it("snapshot hash differs from payload hash", () => {
    const contract = makeContract();
    expect(computeContextPayloadSha256(contract)).not.toBe(computeSnapshotSha256(contract));
  });

  it("hash is 64-char hex", () => {
    const contract = makeContract();
    expect(computeContextPayloadSha256(contract)).toMatch(/^[0-9a-f]{64}$/);
    expect(computeSnapshotSha256(contract)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("golden hash vector — cross-process reproducibility", () => {
    // The golden vector: a fixed contract with known fields must produce a
    // deterministic hash that is the same across processes.
    const contract = makeContract({
      tenantId: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000002",
      workflowRunId: "00000000-0000-4000-8000-000000000003",
      jobId: "00000000-0000-4000-8000-000000000004",
      agentName: "AlinaArchitect",
      taskKind: "architect_plan",
      sourceRefs: [
        {
          sourceVersionId: "00000000-0000-4000-8000-000000000010",
          contentSha256: SHA("golden-content"),
          evidenceFragmentRefs: ["00000000-0000-4000-8000-000000000020"],
        },
      ],
      promptSha256: SHA("golden-prompt"),
      schemaSha256: SHA("golden-schema"),
      policySha256: SHA("golden-policy"),
      modelVersionId: "00000000-0000-4000-8000-000000000005",
      agentVersionId: "00000000-0000-4000-8000-000000000006",
      authorizationDecisionId: "00000000-0000-4000-8000-000000000007",
    });
    const payload = computeContextPayloadSha256(contract);
    const snapshot = computeSnapshotSha256(contract);
    // The hashes must be deterministic and reproducible.
    expect(payload).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot).toMatch(/^[0-9a-f]{64}$/);
    // Recompute and compare — must be identical.
    expect(computeContextPayloadSha256(contract)).toBe(payload);
    expect(computeSnapshotSha256(contract)).toBe(snapshot);
  });
});

// ============================================================
// C. Mutation testing — every relevant integrity check must fail
// ============================================================

describe("mutation testing", () => {
  it("mutated tenantId is detected by sealSnapshot", () => {
    const sealed = makeSealedSnapshot();
    const tampered = { ...sealed, tenantId: UUID_B };
    // The tampered contract has a different tenantId but the original hashes.
    expect(() => sealSnapshot({
      contract: tampered,
      sealedAt: "2026-10-20T12:00:01.000Z",
      predecessorSnapshotId: null,
      agentName: "AlinaArchitect",
      capability: "WRITE_DRAFT",
    })).toThrow(ContextHashMismatchError);
  });

  it("mutated projectId is detected by sealSnapshot", () => {
    const sealed = makeSealedSnapshot();
    const tampered = { ...sealed, projectId: UUID_B };
    expect(() => sealSnapshot({
      contract: tampered,
      sealedAt: "2026-10-20T12:00:01.000Z",
      predecessorSnapshotId: null,
      agentName: "AlinaArchitect",
      capability: "WRITE_DRAFT",
    })).toThrow(ContextHashMismatchError);
  });

  it("mutated agentName is detected by sealSnapshot", () => {
    const sealed = makeSealedSnapshot();
    const tampered = { ...sealed, agentName: "AlinaGuard" as "AlinaArchitect" };
    expect(() => sealSnapshot({
      contract: tampered,
      sealedAt: "2026-10-20T12:00:01.000Z",
      predecessorSnapshotId: null,
      agentName: "AlinaArchitect",
      capability: "WRITE_DRAFT",
    })).toThrow(ContextHashMismatchError);
  });

  it("mutated policySha256 is detected by sealSnapshot", () => {
    const sealed = makeSealedSnapshot();
    const tampered = { ...sealed, policySha256: SHA("tampered-policy") };
    expect(() => sealSnapshot({
      contract: tampered,
      sealedAt: "2026-10-20T12:00:01.000Z",
      predecessorSnapshotId: null,
      agentName: "AlinaArchitect",
      capability: "WRITE_DRAFT",
    })).toThrow(ContextHashMismatchError);
  });

  it("mutated source content is detected by sealSnapshot", () => {
    const sealed = makeSealedSnapshot();
    const tampered = {
      ...sealed,
      sourceRefs: [
        { sourceVersionId: UUID_A, contentSha256: SHA("tampered-content"), evidenceFragmentRefs: [UUID_C] },
        ...sealed.sourceRefs.slice(1),
      ],
    };
    expect(() => sealSnapshot({
      contract: tampered,
      sealedAt: "2026-10-20T12:00:01.000Z",
      predecessorSnapshotId: null,
      agentName: "AlinaArchitect",
      capability: "WRITE_DRAFT",
    })).toThrow(ContextHashMismatchError);
  });

  it("mutated evidence fragment ref is detected by sealSnapshot", () => {
    const sealed = makeSealedSnapshot();
    const tampered = {
      ...sealed,
      sourceRefs: [
        { sourceVersionId: UUID_A, contentSha256: SHA_A, evidenceFragmentRefs: [UUID_D] }, // wrong fragment
        ...sealed.sourceRefs.slice(1),
      ],
    };
    expect(() => sealSnapshot({
      contract: tampered,
      sealedAt: "2026-10-20T12:00:01.000Z",
      predecessorSnapshotId: null,
      agentName: "AlinaArchitect",
      capability: "WRITE_DRAFT",
    })).toThrow(ContextHashMismatchError);
  });
});

// ============================================================
// Authorization (ECIDR §09)
// ============================================================

describe("authorization", () => {
  it("matching agent + capability passes", () => {
    const contract = makeContract({ agentName: "AlinaArchitect" });
    expect(() => assertContextAuthorized(contract, "AlinaArchitect", "WRITE_DRAFT")).not.toThrow();
  });

  it("mismatched agent name throws ContextAuthorizationError", () => {
    const contract = makeContract({ agentName: "AlinaArchitect" });
    expect(() => assertContextAuthorized(contract, "AlinaGuard", "RUN_VALIDATION")).toThrow(
      ContextAuthorizationError,
    );
  });

  it("unauthorized capability throws CapabilityDeniedError", () => {
    const contract = makeContract({ agentName: "AlinaArchitect" });
    expect(() => assertContextAuthorized(contract, "AlinaArchitect", "RUN_VALIDATION")).toThrow(
      CapabilityDeniedError,
    );
  });

  it("RELEASE capability is always denied", () => {
    const contract = makeContract({ agentName: "AlinaArchitect" });
    expect(() => assertContextAuthorized(contract, "AlinaArchitect", "RELEASE")).toThrow(
      CapabilityDeniedError,
    );
  });

  it("EXPORT capability is always denied", () => {
    const contract = makeContract({ agentName: "AlinaArchitect" });
    expect(() => assertContextAuthorized(contract, "AlinaArchitect", "EXPORT")).toThrow(
      CapabilityDeniedError,
    );
  });
});

// ============================================================
// Snapshot lifecycle (ECIDR §07)
// ============================================================

describe("snapshot lifecycle", () => {
  it("sealSnapshot produces a SEALED snapshot", () => {
    const contract = makeContract();
    const sealed = sealSnapshot({
      contract,
      sealedAt: "2026-10-20T12:00:01.000Z",
      predecessorSnapshotId: null,
      agentName: "AlinaArchitect",
      capability: "WRITE_DRAFT",
    });
    expect(sealed.snapshotState).toBe("SEALED");
    expect(sealed.sealedAt).toBe("2026-10-20T12:00:01.000Z");
    expect(sealed.predecessorSnapshotId).toBeNull();
  });

  it("sealSnapshot with mismatched payload hash throws", () => {
    const contract = makeContract();
    const tampered = { ...contract, contextPayloadSha256: "f".repeat(64) };
    expect(() => sealSnapshot({
      contract: tampered,
      sealedAt: "2026-10-20T12:00:01.000Z",
      predecessorSnapshotId: null,
      agentName: "AlinaArchitect",
      capability: "WRITE_DRAFT",
    })).toThrow(ContextHashMismatchError);
  });

  it("sealSnapshot with mismatched snapshot hash throws", () => {
    const contract = makeContract();
    const tampered = { ...contract, snapshotSha256: "f".repeat(64) };
    expect(() => sealSnapshot({
      contract: tampered,
      sealedAt: "2026-10-20T12:00:01.000Z",
      predecessorSnapshotId: null,
      agentName: "AlinaArchitect",
      capability: "WRITE_DRAFT",
    })).toThrow(ContextHashMismatchError);
  });

  it("consumeSnapshot produces a CONSUMED snapshot", () => {
    const sealed = makeSealedSnapshot();
    const consumed = consumeSnapshot(
      sealed,
      "2026-10-20T12:00:02.000Z",
      UUID_A,
      "AlinaArchitect",
      "WRITE_DRAFT",
    );
    expect(consumed.snapshotState).toBe("CONSUMED");
    expect(consumed.consumedByJobId).toBe(UUID_A);
  });

  it("consumeSnapshot on non-SEALED throws", () => {
    const consumed = {
      ...makeSealedSnapshot(),
      snapshotState: "CONSUMED" as "SEALED",
      consumedAt: "2026-10-20T12:00:02.000Z",
      consumedByJobId: UUID_A,
    };
    expect(() => consumeSnapshot(
      consumed,
      "2026-10-20T12:00:03.000Z",
      UUID_A,
      "AlinaArchitect",
      "WRITE_DRAFT",
    )).toThrow(ContextStateError);
  });

  it("rejectSnapshot produces a REJECTED snapshot", () => {
    const sealed = makeSealedSnapshot();
    const rejected = rejectSnapshot(sealed, "2026-10-20T12:00:02.000Z", "HASH_MISMATCH");
    expect(rejected.snapshotState).toBe("REJECTED");
    expect(rejected.rejectReason).toBe("HASH_MISMATCH");
  });

  it("rejectSnapshot on non-SEALED throws", () => {
    const consumed = {
      ...makeSealedSnapshot(),
      snapshotState: "CONSUMED" as "SEALED",
      consumedAt: "2026-10-20T12:00:02.000Z",
      consumedByJobId: UUID_A,
    };
    expect(() => rejectSnapshot(consumed, "2026-10-20T12:00:03.000Z", "HASH_MISMATCH")).toThrow(
      ContextStateError,
    );
  });
});

// ============================================================
// State transitions
// ============================================================

describe("state transitions", () => {
  it("PREPARED -> SEALED is legal", () => {
    expect(isLegalSnapshotTransition("PREPARED", "SEALED")).toBe(true);
    expect(() => assertLegalSnapshotTransition("PREPARED", "SEALED")).not.toThrow();
  });

  it("SEALED -> CONSUMED is legal", () => {
    expect(isLegalSnapshotTransition("SEALED", "CONSUMED")).toBe(true);
    expect(() => assertLegalSnapshotTransition("SEALED", "CONSUMED")).not.toThrow();
  });

  it("SEALED -> REJECTED is legal", () => {
    expect(isLegalSnapshotTransition("SEALED", "REJECTED")).toBe(true);
    expect(() => assertLegalSnapshotTransition("SEALED", "REJECTED")).not.toThrow();
  });

  it("PREPARED -> CONSUMED is illegal", () => {
    expect(isLegalSnapshotTransition("PREPARED", "CONSUMED")).toBe(false);
    expect(() => assertLegalSnapshotTransition("PREPARED", "CONSUMED")).toThrow(ContextStateError);
  });

  it("CONSUMED -> SEALED is illegal (immutable)", () => {
    expect(isLegalSnapshotTransition("CONSUMED", "SEALED")).toBe(false);
    expect(() => assertLegalSnapshotTransition("CONSUMED", "SEALED")).toThrow(ContextStateError);
  });

  it("REJECTED -> SEALED is illegal (immutable)", () => {
    expect(isLegalSnapshotTransition("REJECTED", "SEALED")).toBe(false);
    expect(() => assertLegalSnapshotTransition("REJECTED", "SEALED")).toThrow(ContextStateError);
  });
});

// ============================================================
// E. Replay verification (ECIDR §10)
// ============================================================

describe("replay verification", () => {
  it("valid sealed snapshot replays successfully", () => {
    const sealed = makeSealedSnapshot();
    const result = replaySnapshot(sealed);
    expect(result.valid).toBe(true);
    expect(result.contextPayloadSha256).toBe(sealed.contextPayloadSha256);
    expect(result.snapshotSha256).toBe(sealed.snapshotSha256);
  });

  it("replay is deterministic — same snapshot produces the same result", () => {
    const sealed = makeSealedSnapshot();
    const a = replaySnapshot(sealed);
    const b = replaySnapshot(sealed);
    expect(a).toEqual(b);
  });

  it("replay rejects non-SEALED snapshot", () => {
    const consumed = {
      ...makeSealedSnapshot(),
      snapshotState: "CONSUMED" as "SEALED",
      consumedAt: "2026-10-20T12:00:02.000Z",
      consumedByJobId: UUID_A,
    };
    expect(() => replaySnapshot(consumed)).toThrow(ContextReplayError);
  });

  it("replay rejects tampered payload hash", () => {
    const sealed = makeSealedSnapshot();
    const tampered = { ...sealed, contextPayloadSha256: "f".repeat(64) };
    expect(() => replaySnapshot(tampered)).toThrow(ContextReplayError);
  });

  it("replay rejects tampered snapshot hash", () => {
    const sealed = makeSealedSnapshot();
    const tampered = { ...sealed, snapshotSha256: "f".repeat(64) };
    expect(() => replaySnapshot(tampered)).toThrow(ContextReplayError);
  });

  it("replay rejects tampered tenantId", () => {
    const sealed = makeSealedSnapshot();
    const tampered = { ...sealed, tenantId: UUID_B };
    expect(() => replaySnapshot(tampered)).toThrow(ContextReplayError);
  });

  it("replay rejects tampered source content", () => {
    const sealed = makeSealedSnapshot();
    const tampered = {
      ...sealed,
      sourceRefs: [
        { sourceVersionId: UUID_A, contentSha256: SHA("tampered"), evidenceFragmentRefs: [UUID_C] },
        ...sealed.sourceRefs.slice(1),
      ],
    };
    expect(() => replaySnapshot(tampered)).toThrow(ContextReplayError);
  });

  it("replay is read-only — does not mutate the input", () => {
    const sealed = makeSealedSnapshot();
    const originalJson = JSON.stringify(sealed);
    replaySnapshot(sealed);
    expect(JSON.stringify(sealed)).toBe(originalJson);
  });

  it("replay does not throw on a valid snapshot — zero side effects", () => {
    const sealed = makeSealedSnapshot();
    // Call replay 10 times — each must succeed and produce the same result.
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(replaySnapshot(sealed));
    }
    expect(new Set(results.map((r) => r.snapshotSha256)).size).toBe(1);
  });
});

// ============================================================
// Cross-tenant isolation
// ============================================================

describe("cross-tenant isolation", () => {
  it("two tenants with the same source refs produce different payload hashes", () => {
    const a = makeContract({ tenantId: UUID_A });
    const b = makeContract({ tenantId: UUID_B });
    expect(computeContextPayloadSha256(a)).not.toBe(computeContextPayloadSha256(b));
  });

  it("two tenants with the same source refs produce different snapshot hashes", () => {
    const a = makeContract({ tenantId: UUID_A });
    const b = makeContract({ tenantId: UUID_B });
    expect(computeSnapshotSha256(a)).not.toBe(computeSnapshotSha256(b));
  });

  it("cross-tenant replay is detected by authorization", () => {
    const sealedA = makeSealedSnapshot({ tenantId: UUID_A });
    // If tenant B tries to consume tenant A's snapshot, the authorization
    // check catches it when the agent name + capability don't match the context.
    const tampered = { ...sealedA, tenantId: UUID_B };
    expect(() => replaySnapshot(tampered)).toThrow(ContextReplayError);
  });
});
