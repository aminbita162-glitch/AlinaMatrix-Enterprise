/**
 * AlinaGenerate domain logic — Phase 6.
 *
 * runGenerate:
 *   - Generate may reference existing claim IDs only.
 *     Any claimId not present in the supplied evidence set is rejected.
 *   - Calls DeterministicFakeProvider with pinned version inputs.
 *   - Advances the workflow run to GENERATED (asserts the legal transition).
 *   - Does NOT write to the database (caller's responsibility).
 *
 * Directive invariants:
 *   R07 — No live LLM.
 *   Phase 6 — "Generate may reference existing claim ids only."
 *   Phase 6 — Workflow may reach GENERATED. Not RELEASED.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { createHash } from "node:crypto";
import { assertLegalTransition, type WorkflowState } from "./workflow.js";
import {
  assertAgentCapability,
  fakeProvider,
  type FakeProviderInput,
} from "./agents.js";

// ============================================================
// Errors
// ============================================================

/**
 * Thrown when a claim ID supplied to Generate is not in the evidence set.
 * Directive: "Generate may reference existing claim ids only."
 */
export class UnknownClaimError extends Error {
  constructor(claimId: string) {
    super(
      `Claim "${claimId}" is not in the evidence set for this workflow run. ` +
      "Generate may reference existing claim IDs only.",
    );
    this.name = "UnknownClaimError";
  }
}

// ============================================================
// Types
// ============================================================

export interface GenerateInput {
  /** Server-derived tenant ID. */
  tenantId:         string;
  projectId:        string;
  workflowRunId:    string;
  /** Current workflow state — must be ARCHITECTED to advance to GENERATED. */
  currentState:     WorkflowState;
  /** SHA-256 of canonical plan content (planHash from the Architect step). */
  planHash:         string;
  /**
   * Claim IDs that the Generate step is allowed to reference.
   * These are the existing claim IDs for this project, loaded before calling.
   */
  allowedClaimIds:  ReadonlySet<string>;
  /**
   * Claim IDs the generator wants to embed in the draft.
   * Every ID here must exist in allowedClaimIds.
   */
  requestedClaimIds: string[];
  /** Pinned version inputs. */
  pins: {
    promptSha256:    string;
    schemaSha256:    string;
    policySha256:    string;
    modelId:         string;
    agentVersionId:  string;
    promptVersionId: string;
    schemaVersionId: string;
    policyVersionId: string;
  };
}

export interface GenerateResult {
  /** Next state after generation — always GENERATED. */
  nextState:        "GENERATED";
  draftHash:        string;
  outputJson:       string;
  /** Validated claim IDs embedded in the draft. */
  embeddedClaimIds: string[];
  promptTokens:     number;
  completionTokens: number;
}

// ============================================================
// Claim reference validation
// ============================================================

/**
 * Assert that every requested claim ID is in the allowed set.
 * Throws UnknownClaimError on first violation.
 */
export function assertClaimIdsExist(
  requestedClaimIds: string[],
  allowedClaimIds: ReadonlySet<string>,
): void {
  for (const id of requestedClaimIds) {
    if (!allowedClaimIds.has(id)) {
      throw new UnknownClaimError(id);
    }
  }
}

// ============================================================
// Draft hash
// ============================================================

function computeDraftHash(
  workflowRunId: string,
  planHash: string,
  outputHash: string,
  claimIds: string[],
): string {
  const sortedClaims = [...claimIds].sort().join(",");
  const canonical = [workflowRunId, planHash, outputHash, sortedClaims].join("|");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

// ============================================================
// runGenerate
// ============================================================

/**
 * Execute the Generate step.
 *
 * Preconditions enforced:
 *   1. Current state must be ARCHITECTED (legal transition to GENERATED).
 *   2. AlinaArchitect must hold WRITE_DRAFT capability (Architect drives generation).
 *   3. Every requestedClaimId must exist in allowedClaimIds.
 *
 * @throws IllegalTransitionError if currentState → GENERATED is not a legal transition.
 * @throws CapabilityDeniedError  if capability is not held.
 * @throws UnknownClaimError      if any requested claim is not in the evidence set.
 */
export function runGenerate(input: GenerateInput): GenerateResult {
  // 1. Assert legal state transition.
  assertLegalTransition(input.currentState, "GENERATED");

  // 2. Capability guard: AlinaArchitect holds WRITE_DRAFT and drives this step.
  assertAgentCapability("AlinaArchitect", "WRITE_DRAFT");

  // 3. Validate all referenced claim IDs exist.
  assertClaimIdsExist(input.requestedClaimIds, input.allowedClaimIds);

  // 4. Call the deterministic fake provider.
  const fakeInput: FakeProviderInput = {
    promptSha256: input.pins.promptSha256,
    schemaSha256: input.pins.schemaSha256,
    // Include planHash in inputHash so generate output is pinned to the plan.
    inputHash:    createHash("sha256")
      .update(`${input.planHash}|${[...input.requestedClaimIds].sort().join(",")}`, "utf8")
      .digest("hex"),
    context: `generate:run=${input.workflowRunId}`,
  };

  const fakeOutput = fakeProvider.call(fakeInput);

  const draftHash = computeDraftHash(
    input.workflowRunId,
    input.planHash,
    fakeOutput.outputHash,
    input.requestedClaimIds,
  );

  return {
    nextState:        "GENERATED",
    draftHash,
    outputJson:       fakeOutput.outputJson,
    embeddedClaimIds: [...input.requestedClaimIds],
    promptTokens:     fakeOutput.promptTokens,
    completionTokens: fakeOutput.completionTokens,
  };
}
