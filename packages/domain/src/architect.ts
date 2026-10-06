/**
 * AlinaArchitect domain logic — Phase 6.
 *
 * runArchitectPlan:
 *   - Asserts AlinaArchitect capability (WRITE_DRAFT).
 *   - Calls DeterministicFakeProvider with pinned version inputs.
 *   - Produces a deterministic plan hash: same versioned inputs → same hash.
 *   - Does NOT write to the database (caller's responsibility).
 *
 * Directive invariants:
 *   R07 — No live LLM. DeterministicFakeProvider is the only provider.
 *   R08 — tenant_id is not accepted from the client; it flows from the
 *          server-side session through workflowRun.tenantId.
 *   Phase 6 — Architect writes a plan only. Cannot release or export.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { createHash } from "node:crypto";
import {
  assertAgentCapability,
  fakeProvider,
  type FakeProviderInput,
} from "./agents.js";

// ============================================================
// Types
// ============================================================

export interface ArchitectPlanVersionPins {
  promptSha256:     string;
  schemaSha256:     string;
  policySha256:     string;
  modelId:          string;
  /** UUID of the agent_version row. */
  agentVersionId:   string;
  promptVersionId:  string;
  schemaVersionId:  string;
  policyVersionId:  string;
}

export interface ArchitectPlanInput {
  /** Server-derived tenant ID. Never from a client-supplied field. */
  tenantId:          string;
  projectId:         string;
  workflowRunId:     string;
  /** SHA-256 of canonical source version IDs + project evidence summary. */
  inputHash:         string;
  /** Sorted source version IDs (already canonical). */
  sourceVersionIds:  string[];
  /** All version pins must be frozen before calling. */
  pins:              ArchitectPlanVersionPins;
}

/**
 * The output of runArchitectPlan.
 * planHash is the primary determinism proof:
 *   same (tenantId, inputHash, pins) → same planHash.
 */
export interface ArchitectPlanResult {
  planHash:       string;
  outputJson:     string;
  /** Sections extracted from the fake-provider output. */
  sections:       Array<{ sectionKey: string; instruction: string }>;
  promptTokens:   number;
  completionTokens: number;
}

// ============================================================
// Deterministic section extraction
// ============================================================

/**
 * Derive a stable set of M03 sections from the fake provider's output hash.
 * The set of section keys is fixed per the M03 content model.
 * The instructions are derived deterministically from the output hash bytes
 * so that same inputs → same sections.
 *
 * This is the only place the M03 section list is defined for the Architect step.
 */
const M03_SECTION_KEYS = [
  "metadata",
  "context",
  "decision",
  "status",
  "drivers",
  "options",
  "outcome",
  "consequences",
  "evidenceMap",
  "claimAtoms",
  "assumptions",
  "negativeEvidence",
  "terminology",
  "risks",
  "openQuestions",
  "review",
  "approval",
  "limitations",
  "releaseMetadata",
] as const;

function deriveSections(
  outputHash: string,
): Array<{ sectionKey: string; instruction: string }> {
  const hashBytes = Buffer.from(outputHash, "hex");
  return M03_SECTION_KEYS.map((key, i) => {
    // Each instruction is a deterministic excerpt of the output hash at an offset.
    const byteOffset = (i * 2) % (hashBytes.length - 4);
    const instructionToken = hashBytes
      .slice(byteOffset, byteOffset + 4)
      .toString("hex");
    return {
      sectionKey:  key,
      instruction: `populate-${key}:${instructionToken}`,
    };
  });
}

// ============================================================
// Plan hash
// ============================================================

/**
 * Canonical plan hash: SHA-256 of the pipe-joined versioned inputs.
 * Same inputs always produce the same hash.
 */
function computePlanHash(input: ArchitectPlanInput, outputHash: string): string {
  const sortedSvIds = [...input.sourceVersionIds].sort().join(",");
  const canonical = [
    input.tenantId,
    input.projectId,
    input.workflowRunId,
    sortedSvIds,
    input.inputHash,
    input.pins.promptSha256,
    input.pins.schemaSha256,
    input.pins.policySha256,
    input.pins.modelId,
    outputHash,
  ].join("|");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

// ============================================================
// runArchitectPlan
// ============================================================

/**
 * Execute the Architect planning step.
 *
 * Capability checks:
 *   - assertAgentCapability("AlinaArchitect", "WRITE_DRAFT") — the Architect writes plans.
 *   - Release/export blocked unconditionally (assertAgentCapability enforces this).
 *
 * Determinism:
 *   - Same (inputHash, pins) → same planHash and sections.
 *   - Verified in architect.test.ts.
 *
 * Prompt injection:
 *   - The inputHash is a SHA-256 of source bytes; it cannot carry injection text.
 *   - The fake provider's output is derived from (promptSha256, schemaSha256, inputHash)
 *     only; injected strings in source text do not affect those hashes.
 *
 * @throws CapabilityDeniedError if AlinaArchitect does not hold WRITE_DRAFT.
 */
export function runArchitectPlan(input: ArchitectPlanInput): ArchitectPlanResult {
  // Capability guard: Architect must hold WRITE_DRAFT.
  assertAgentCapability("AlinaArchitect", "WRITE_DRAFT");

  const fakeInput: FakeProviderInput = {
    promptSha256:  input.pins.promptSha256,
    schemaSha256:  input.pins.schemaSha256,
    inputHash:     input.inputHash,
    context:       `tenant=${input.tenantId} project=${input.projectId} run=${input.workflowRunId}`,
  };

  const fakeOutput = fakeProvider.call(fakeInput);
  const planHash   = computePlanHash(input, fakeOutput.outputHash);
  const sections   = deriveSections(fakeOutput.outputHash);

  return {
    planHash,
    outputJson:       fakeOutput.outputJson,
    sections,
    promptTokens:     fakeOutput.promptTokens,
    completionTokens: fakeOutput.completionTokens,
  };
}

/**
 * Assert that AlinaArchitect does not have RELEASE capability.
 * Used in tests to document and enforce the invariant.
 * Throws CapabilityDeniedError (expected behaviour in tests).
 */
export function assertArchitectCannotRelease(): void {
  assertAgentCapability("AlinaArchitect", "RELEASE");
}
