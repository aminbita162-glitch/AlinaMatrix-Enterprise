/**
 * ECIDR runtime integration tests — Gap 1 (CRITICAL).
 *
 * Proves that ECIDR context sealing, authorization, and consumption lifecycle
 * are enforced at the actual execution boundaries of all four agents.
 *
 * Test plan (ECIDR §13):
 *   - Agent context handoff is bound to authenticated server-derived tenant.
 *   - Project, workflow run, job, agent, task, source versions, and policy
 *     pins are bound into the context contract.
 *   - Authorization is enforced before materializing or consuming evidence context.
 *   - The context snapshot is validated and sealed before execution.
 *   - Consumption is recorded against the authorized agent/job.
 *   - Invalid, stale, revoked, mismatched, or unauthorized context is rejected.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  sealExecutionContext,
  consumeExecutionContext,
  rejectExecutionContext,
  buildContextContract,
  AGENT_TASK_CAPABILITIES,
  AGENT_TASK_KINDS,
  derivePromptSha256,
  assertAgentTaskBinding,
  type AgentExecutionContextInput,
} from "../src/ecidr.js";
import {
  CANONICALIZATION_VERSION,
  replaySnapshot,
  replaySnapshotWithEvidence,
  ContextAuthorizationError,
  ContextStateError,
  ContextReplayError,
  type AuthorizationEvidence,
  type ReplayEvidence,
} from "@alinamatrix/domain";
import type { SourceRef } from "@alinamatrix/contracts";

// ============================================================
// Fixtures
// ============================================================

const UUID_A = "aaaaaaaa-0000-4000-8000-000000000001";
const UUID_B = "bbbbbbbb-0000-4000-8000-000000000002";
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

function makeExecutionInput(
  overrides: Partial<AgentExecutionContextInput> = {},
): AgentExecutionContextInput {
  return {
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
    authorizationDecisionId: UUID_A,
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<AuthorizationEvidence> = {}): AuthorizationEvidence {
  return {
    serverTenantId: UUID_A,
    accessibleProjectIds: new Set([UUID_A]),
    ownedWorkflowRunIds: new Set([UUID_A]),
    ownedJobIds: new Set([UUID_A]),
    sourceVersionHashes: new Map([
      [UUID_A, SHA_A],
      [UUID_B, SHA_B],
    ]),
    revokedSourceVersionIds: new Set(),
    cancelledJobIds: new Set(),
    expectedPolicySha256: SHA("policy"),
    expectedSchemaSha256: SHA("schema"),
    expectedModelVersionId: UUID_A,
    ...overrides,
  };
}

function makeReplayEvidence(overrides: Partial<ReplayEvidence> = {}): ReplayEvidence {
  return {
    sourceVersionContentHashes: new Map([
      [UUID_A, SHA_A],
      [UUID_B, SHA_B],
    ]),
    revokedSourceVersionIds: new Set(),
    historicalPolicySha256: SHA("policy"),
    historicalSchemaSha256: SHA("schema"),
    historicalModelVersionId: UUID_A,
    expectedCanonicalizationVersion: CANONICALIZATION_VERSION,
    recordedProviderOutputHash: null,
    ...overrides,
  };
}

// ============================================================
// Build context contract — schema + hash computation
// ============================================================

describe("buildContextContract", () => {
  it("produces a valid ContextContractV1 with computed hashes", () => {
    const input = makeExecutionInput();
    const contract = buildContextContract(input, "2026-10-20T12:00:00.000Z");
    expect(contract.contractVersion).toBe("1");
    expect(contract.tenantId).toBe(UUID_A);
    expect(contract.contextPayloadSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(contract.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
    // The hashes must differ (payload ≠ snapshot).
    expect(contract.contextPayloadSha256).not.toBe(contract.snapshotSha256);
  });

  it("is deterministic — same input produces the same contract", () => {
    const input = makeExecutionInput();
    const a = buildContextContract(input, "2026-10-20T12:00:00.000Z");
    const b = buildContextContract(input, "2026-10-20T12:00:00.000Z");
    expect(a.contextPayloadSha256).toBe(b.contextPayloadSha256);
    expect(a.snapshotSha256).toBe(b.snapshotSha256);
  });

  it("different tenantId produces different hashes", () => {
    const a = buildContextContract(makeExecutionInput({ tenantId: UUID_A }), "2026-10-20T12:00:00.000Z");
    const b = buildContextContract(makeExecutionInput({ tenantId: UUID_B }), "2026-10-20T12:00:00.000Z");
    expect(a.contextPayloadSha256).not.toBe(b.contextPayloadSha256);
  });
});

// ============================================================
// Seal execution context — the primary enforcement point
// ============================================================

describe("sealExecutionContext — AlinaArchitect", () => {
  it("seals a valid context for AlinaArchitect with WRITE_DRAFT", () => {
    const input = makeExecutionInput({ agentName: "AlinaArchitect", taskKind: "architect_plan" });
    const evidence = makeEvidence();
    const result = sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence);
    expect(result.sealed.snapshotState).toBe("SEALED");
    expect(result.sealed.agentName).toBe("AlinaArchitect");
    expect(result.contract.tenantId).toBe(UUID_A);
  });

  it("rejects when the agent does not have the requested capability", () => {
    // AlinaArchitect with RUN_VALIDATION — the agent name in the contract
    // matches, but the capability is not in the agent's set.
    const input = makeExecutionInput({ agentName: "AlinaArchitect", taskKind: "architect_plan" });
    const evidence = makeEvidence();
    expect(() =>
      sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "RUN_VALIDATION", evidence),
    ).toThrow();
  });
});

describe("sealExecutionContext — AlinaGuard", () => {
  it("seals a valid context for AlinaGuard with RUN_VALIDATION", () => {
    const input = makeExecutionInput({
      agentName: "AlinaGuard",
      taskKind: "guard_validate",
    });
    const evidence = makeEvidence();
    const result = sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "RUN_VALIDATION", evidence);
    expect(result.sealed.snapshotState).toBe("SEALED");
    expect(result.sealed.agentName).toBe("AlinaGuard");
  });

  it("rejects when AlinaGuard is given WRITE_DRAFT (not in its capability set)", () => {
    const input = makeExecutionInput({ agentName: "AlinaGuard", taskKind: "guard_validate" });
    const evidence = makeEvidence();
    expect(() =>
      sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence),
    ).toThrow();
  });
});

describe("sealExecutionContext — AlinaDocEngine", () => {
  it("seals a valid context for AlinaDocEngine with COMPILE_ARTIFACT", () => {
    const input = makeExecutionInput({
      agentName: "AlinaDocEngine",
      taskKind: "doc_compile",
    });
    const evidence = makeEvidence();
    const result = sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "COMPILE_ARTIFACT", evidence);
    expect(result.sealed.snapshotState).toBe("SEALED");
    expect(result.sealed.agentName).toBe("AlinaDocEngine");
  });
});

describe("sealExecutionContext — AlinaOptimizer", () => {
  it("seals a valid context for AlinaOptimizer with WRITE_CACHE_METADATA", () => {
    const input = makeExecutionInput({
      agentName: "AlinaOptimizer",
      taskKind: "cache_metadata",
    });
    const evidence = makeEvidence();
    const result = sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_CACHE_METADATA", evidence);
    expect(result.sealed.snapshotState).toBe("SEALED");
    expect(result.sealed.agentName).toBe("AlinaOptimizer");
  });
});

// ============================================================
// Deep authorization — tenant, project, job, source, policy dimensions
// ============================================================

describe("sealExecutionContext — deep authorization dimensions", () => {
  it("rejects cross-tenant access (serverTenantId mismatch)", () => {
    const input = makeExecutionInput({ tenantId: UUID_A });
    const evidence = makeEvidence({ serverTenantId: UUID_B });
    expect(() =>
      sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence),
    ).toThrow(ContextAuthorizationError);
  });

  it("rejects when the project is not accessible by the tenant", () => {
    const input = makeExecutionInput({ projectId: UUID_B });
    const evidence = makeEvidence({ accessibleProjectIds: new Set([UUID_A]) });
    expect(() =>
      sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence),
    ).toThrow(ContextAuthorizationError);
  });

  it("rejects when the workflow run is not owned by the tenant", () => {
    const input = makeExecutionInput({ workflowRunId: UUID_B });
    const evidence = makeEvidence({ ownedWorkflowRunIds: new Set([UUID_A]) });
    expect(() =>
      sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence),
    ).toThrow(ContextAuthorizationError);
  });

  it("rejects when the job is not owned by the tenant", () => {
    const input = makeExecutionInput({ jobId: UUID_B });
    const evidence = makeEvidence({ ownedJobIds: new Set([UUID_A]) });
    expect(() =>
      sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence),
    ).toThrow(ContextAuthorizationError);
  });

  it("rejects when the job is CANCELLED", () => {
    const input = makeExecutionInput({ jobId: UUID_A });
    const evidence = makeEvidence({ cancelledJobIds: new Set([UUID_A]) });
    expect(() =>
      sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence),
    ).toThrow(ContextAuthorizationError);
  });

  it("rejects when a source version is revoked", () => {
    const input = makeExecutionInput();
    const evidence = makeEvidence({ revokedSourceVersionIds: new Set([UUID_A]) });
    expect(() =>
      sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence),
    ).toThrow(ContextAuthorizationError);
  });

  it("rejects when a source version hash does not match", () => {
    const input = makeExecutionInput({
      sourceRefs: [
        { sourceVersionId: UUID_A, contentSha256: SHA("wrong-hash"), evidenceFragmentRefs: [UUID_C] },
        ...makeSourceRefs().slice(1),
      ],
    });
    const evidence = makeEvidence();
    expect(() =>
      sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence),
    ).toThrow(ContextAuthorizationError);
  });

  it("rejects when a source version is not found in the evidence store", () => {
    const input = makeExecutionInput({
      sourceRefs: [
        { sourceVersionId: UUID_C, contentSha256: SHA("content-c"), evidenceFragmentRefs: [UUID_D] },
        ...makeSourceRefs(),
      ],
    });
    const evidence = makeEvidence(); // UUID_C not in sourceVersionHashes
    expect(() =>
      sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence),
    ).toThrow(ContextAuthorizationError);
  });

  it("rejects when the policy hash does not match", () => {
    const input = makeExecutionInput({ policySha256: SHA("wrong-policy") });
    const evidence = makeEvidence({ expectedPolicySha256: SHA("policy") });
    expect(() =>
      sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence),
    ).toThrow(ContextAuthorizationError);
  });

  it("rejects when the schema hash does not match", () => {
    const input = makeExecutionInput({ schemaSha256: SHA("wrong-schema") });
    const evidence = makeEvidence({ expectedSchemaSha256: SHA("schema") });
    expect(() =>
      sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence),
    ).toThrow(ContextAuthorizationError);
  });

  it("rejects when the model version ID does not match", () => {
    const input = makeExecutionInput({ modelVersionId: UUID_B });
    const evidence = makeEvidence({ expectedModelVersionId: UUID_A });
    expect(() =>
      sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence),
    ).toThrow(ContextAuthorizationError);
  });

  it("rejects RELEASE capability for all agents", () => {
    const input = makeExecutionInput();
    const evidence = makeEvidence();
    expect(() =>
      sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "RELEASE", evidence),
    ).toThrow();
  });

  it("rejects EXPORT capability for all agents", () => {
    const input = makeExecutionInput();
    const evidence = makeEvidence();
    expect(() =>
      sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "EXPORT", evidence),
    ).toThrow();
  });
});

// ============================================================
// Consume execution context
// ============================================================

describe("consumeExecutionContext", () => {
  it("consumes a sealed snapshot and records the consuming job", () => {
    const input = makeExecutionInput();
    const evidence = makeEvidence();
    const sealed = sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence);
    const consumed = consumeExecutionContext(
      sealed.sealed,
      "2026-10-20T12:00:02.000Z",
      UUID_A,
      "AlinaArchitect",
      "WRITE_DRAFT",
    );
    expect(consumed.consumed.snapshotState).toBe("CONSUMED");
    expect(consumed.consumed.consumedByJobId).toBe(UUID_A);
  });

  it("rejects consuming a non-SEALED snapshot", () => {
    // We can't easily build a non-SEALED snapshot from the seal path,
    // so we test the domain-level guard.
    const input = makeExecutionInput();
    const evidence = makeEvidence();
    const sealed = sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence);
    // Tamper the state to CONSUMED (simulating a double-consume attempt).
    const alreadyConsumed = { ...sealed.sealed, snapshotState: "CONSUMED" as "SEALED", consumedAt: "2026-10-20T12:00:02.000Z", consumedByJobId: UUID_A };
    expect(() =>
      consumeExecutionContext(alreadyConsumed as never, "2026-10-20T12:00:03.000Z", UUID_A, "AlinaArchitect", "WRITE_DRAFT"),
    ).toThrow(ContextStateError);
  });
});

// ============================================================
// Reject execution context
// ============================================================

describe("rejectExecutionContext", () => {
  it("rejects a sealed snapshot with a reason code", () => {
    const input = makeExecutionInput();
    const evidence = makeEvidence();
    const sealed = sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence);
    const rejected = rejectExecutionContext(sealed.sealed, "2026-10-20T12:00:02.000Z", "TENANT_MISMATCH");
    expect(rejected.snapshotState).toBe("REJECTED");
    expect(rejected.rejectReason).toBe("TENANT_MISMATCH");
  });
});

// ============================================================
// Replay — evidence-grounded verification
// ============================================================

describe("replaySnapshotWithEvidence — runtime integration", () => {
  it("replays a valid sealed snapshot with matching evidence", () => {
    const input = makeExecutionInput();
    const evidence = makeEvidence();
    const sealed = sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence);
    const replayEvidence = makeReplayEvidence();
    const result = replaySnapshotWithEvidence(sealed.sealed, replayEvidence);
    expect(result.valid).toBe(true);
    expect(result.evidenceChecks.sourceVersions).toBe(2);
  });

  it("rejects replay when a source version is missing from the evidence store", () => {
    const input = makeExecutionInput();
    const evidence = makeEvidence();
    const sealed = sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence);
    const replayEvidence = makeReplayEvidence({
      sourceVersionContentHashes: new Map([[UUID_A, SHA_A]]), // UUID_B missing
    });
    expect(() => replaySnapshotWithEvidence(sealed.sealed, replayEvidence)).toThrow(ContextReplayError);
  });

  it("rejects replay when a source version's content hash differs from the authoritative record", () => {
    const input = makeExecutionInput();
    const evidence = makeEvidence();
    const sealed = sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence);
    const replayEvidence = makeReplayEvidence({
      sourceVersionContentHashes: new Map([
        [UUID_A, SHA_A],
        [UUID_B, SHA("tampered-content")], // different hash
      ]),
    });
    expect(() => replaySnapshotWithEvidence(sealed.sealed, replayEvidence)).toThrow(ContextReplayError);
  });

  it("rejects replay when a source version is revoked under the historical policy", () => {
    const input = makeExecutionInput();
    const evidence = makeEvidence();
    const sealed = sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence);
    const replayEvidence = makeReplayEvidence({
      revokedSourceVersionIds: new Set([UUID_A]),
    });
    expect(() => replaySnapshotWithEvidence(sealed.sealed, replayEvidence)).toThrow(ContextReplayError);
  });

  it("rejects replay when the policy hash does not match the historical pin", () => {
    const input = makeExecutionInput();
    const evidence = makeEvidence();
    const sealed = sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence);
    const replayEvidence = makeReplayEvidence({
      historicalPolicySha256: SHA("wrong-policy"),
    });
    expect(() => replaySnapshotWithEvidence(sealed.sealed, replayEvidence)).toThrow(ContextReplayError);
  });

  it("rejects replay when the schema hash does not match the historical pin", () => {
    const input = makeExecutionInput();
    const evidence = makeEvidence();
    const sealed = sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence);
    const replayEvidence = makeReplayEvidence({
      historicalSchemaSha256: SHA("wrong-schema"),
    });
    expect(() => replaySnapshotWithEvidence(sealed.sealed, replayEvidence)).toThrow(ContextReplayError);
  });

  it("rejects replay when the model version does not match", () => {
    const input = makeExecutionInput();
    const evidence = makeEvidence();
    const sealed = sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence);
    const replayEvidence = makeReplayEvidence({
      historicalModelVersionId: UUID_B,
    });
    expect(() => replaySnapshotWithEvidence(sealed.sealed, replayEvidence)).toThrow(ContextReplayError);
  });

  it("rejects replay when the canonicalization version does not match", () => {
    const input = makeExecutionInput();
    const evidence = makeEvidence();
    const sealed = sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence);
    const replayEvidence = makeReplayEvidence({
      expectedCanonicalizationVersion: "wrong-version",
    });
    expect(() => replaySnapshotWithEvidence(sealed.sealed, replayEvidence)).toThrow(ContextReplayError);
  });

  it("is read-only — does not mutate the sealed snapshot", () => {
    const input = makeExecutionInput();
    const evidence = makeEvidence();
    const sealed = sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence);
    const originalJson = JSON.stringify(sealed.sealed);
    const replayEvidence = makeReplayEvidence();
    replaySnapshotWithEvidence(sealed.sealed, replayEvidence);
    expect(JSON.stringify(sealed.sealed)).toBe(originalJson);
  });
});

// ============================================================
// Per-agent capability binding
// ============================================================

describe("AGENT_TASK_CAPABILITIES + AGENT_TASK_KINDS", () => {
  it("AlinaArchitect → WRITE_DRAFT / architect_plan", () => {
    expect(AGENT_TASK_CAPABILITIES.AlinaArchitect).toBe("WRITE_DRAFT");
    expect(AGENT_TASK_KINDS.AlinaArchitect).toBe("architect_plan");
  });

  it("AlinaGuard → RUN_VALIDATION / guard_validate", () => {
    expect(AGENT_TASK_CAPABILITIES.AlinaGuard).toBe("RUN_VALIDATION");
    expect(AGENT_TASK_KINDS.AlinaGuard).toBe("guard_validate");
  });

  it("AlinaDocEngine → COMPILE_ARTIFACT / doc_compile", () => {
    expect(AGENT_TASK_CAPABILITIES.AlinaDocEngine).toBe("COMPILE_ARTIFACT");
    expect(AGENT_TASK_KINDS.AlinaDocEngine).toBe("doc_compile");
  });

  it("AlinaOptimizer → WRITE_CACHE_METADATA / cache_metadata", () => {
    expect(AGENT_TASK_CAPABILITIES.AlinaOptimizer).toBe("WRITE_CACHE_METADATA");
    expect(AGENT_TASK_KINDS.AlinaOptimizer).toBe("cache_metadata");
  });
});

describe("assertAgentTaskBinding", () => {
  it("passes when the agent and task kind match", () => {
    expect(() => assertAgentTaskBinding("AlinaArchitect", "architect_plan")).not.toThrow();
    expect(() => assertAgentTaskBinding("AlinaGuard", "guard_validate")).not.toThrow();
    expect(() => assertAgentTaskBinding("AlinaDocEngine", "doc_compile")).not.toThrow();
    expect(() => assertAgentTaskBinding("AlinaOptimizer", "cache_metadata")).not.toThrow();
  });

  it("throws when the agent and task kind do not match", () => {
    expect(() => assertAgentTaskBinding("AlinaArchitect", "guard_validate")).toThrow();
    expect(() => assertAgentTaskBinding("AlinaGuard", "architect_plan")).toThrow();
  });
});

describe("derivePromptSha256", () => {
  it("is deterministic — same source versions + task kind produce the same hash", () => {
    const a = derivePromptSha256([UUID_A, UUID_B], "architect_plan");
    const b = derivePromptSha256([UUID_B, UUID_A], "architect_plan"); // different order
    expect(a).toBe(b); // sorted internally
  });

  it("produces a 64-char hex string", () => {
    expect(derivePromptSha256([UUID_A], "architect_plan")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different task kinds produce different hashes", () => {
    const a = derivePromptSha256([UUID_A], "architect_plan");
    const b = derivePromptSha256([UUID_A], "guard_validate");
    expect(a).not.toBe(b);
  });
});

// ============================================================
// Full lifecycle — seal → consume → replay
// ============================================================

describe("full lifecycle — seal → consume → replay", () => {
  it("seal then consume then replay (read-only) succeeds", () => {
    const input = makeExecutionInput();
    const evidence = makeEvidence();
    const sealed = sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence);
    const consumed = consumeExecutionContext(
      sealed.sealed,
      "2026-10-20T12:00:02.000Z",
      UUID_A,
      "AlinaArchitect",
      "WRITE_DRAFT",
    );
    expect(consumed.consumed.snapshotState).toBe("CONSUMED");
    // Replay on the sealed snapshot (not consumed) should still succeed.
    const replayEvidence = makeReplayEvidence();
    const replayResult = replaySnapshotWithEvidence(sealed.sealed, replayEvidence);
    expect(replayResult.valid).toBe(true);
  });

  it("replay on the original sealed snapshot (self-referential) also works", () => {
    const input = makeExecutionInput();
    const evidence = makeEvidence();
    const sealed = sealExecutionContext(input, "2026-10-20T12:00:01.000Z", "WRITE_DRAFT", evidence);
    const result = replaySnapshot(sealed.sealed);
    expect(result.valid).toBe(true);
  });
});
