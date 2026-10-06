/**
 * Tests for packages/domain/src/guard.ts
 *
 * Covers:
 *   - Clean draft (all rules pass) → hardPassed + softPassed → APPROVED
 *   - Schema rule: invalid draft JSON → schema error, hardPassed=false
 *   - Quote-lock rule: bad hash on witnessed claim → quoteLockErrors > 0
 *   - Unsupported rule: unsupported claim → unsupportedBlocks > 0, NEEDS_REVIEW
 *   - Contradiction rule: flagged claim → contradictions > 0, NEEDS_REVIEW
 *   - Neg-evidence rule: supported claim without note → negEvidenceErrors > 0, NEEDS_REVIEW
 *   - Terminology drift: draft term not in registeredTerms → terminologyDrifts > 0, NEEDS_REVIEW
 *   - Multiple soft blocks accumulate in findings
 *   - AlinaGuard capability: RUN_VALIDATION is required
 *   - guardResultToTransition: APPROVED only when both hard and soft pass
 *   - Workflow may NOT reach RELEASED via guard output
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  runGuard,
  guardResultToTransition,
  type GuardInput,
  type GuardClaimInput,
  type GuardCitationInput,
} from "./guard.js";
import { CapabilityDeniedError } from "./agents.js";
import { assertAgentCapability } from "./agents.js";

// ============================================================
// Helpers
// ============================================================

function makeUuid(): string {
  return "00000000-0000-4000-8000-" + Math.random().toString(16).slice(2, 14).padEnd(12, "0");
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** Build a minimal valid M03 content model JSON. */
function validDraftJson(): Record<string, unknown> {
  const today = "2026-10-01";
  const tenantId = makeUuid();
  const projectId = makeUuid();
  const wfRunId = makeUuid();
  return {
    metadata: {
      id:              makeUuid(),
      title:           "Test ADR",
      version:         1,
      projectId,
      tenantId,
      workflowRunId:   wfRunId,
      createdAt:       "2026-10-01T00:00:00.000Z",
      documentType:    "M03",
      productSentence: "Turn complex evidence into auditable professional artifacts.",
      statusLine:      "Enterprise Candidate  -  Active Development",
    },
    context: {
      background:       "Background text.",
      problemStatement: "Problem statement.",
    },
    decision: {
      decisionStatement: "We decide to use approach A.",
      decisionOwner:     "Architect",
      decisionDate:      today,
    },
    status: { value: "proposed" },
    drivers: [{ id: "d1", description: "Driver 1", type: "constraint" }],
    options: [{ id: "o1", title: "Option A", description: "Description of A", pros: [], cons: [] }],
    outcome: { chosenOptionId: "o1", rationale: "Best fit." },
    consequences: [],
    evidenceMap: [],
    claimAtoms: [],
    assumptions: [],
    negativeEvidence: [],
    terminology: [],
    risks: [],
    openQuestions: [],
    review: [],
    approval: [],
    limitations: [{ description: "Beachhead only.", category: "scope" }],
  };
}

/** Build a clean GuardInput with no claims, no citations, no registered terms needed. */
function cleanInput(): GuardInput {
  return {
    draftJson:       validDraftJson(),
    claims:          [],
    citations:       [],
    registeredTerms: new Set(),
  };
}

// ============================================================
// Schema rule
// ============================================================

describe("runGuard — schema rule", () => {
  it("passes a valid draft with schemaErrors=0", () => {
    const r = runGuard(cleanInput());
    expect(r.counts.schemaErrors).toBe(0);
    expect(r.hardPassed).toBe(true);
  });

  it("fails with schemaErrors > 0 when draftJson is not a valid M03 model", () => {
    const r = runGuard({ ...cleanInput(), draftJson: { broken: true } });
    expect(r.counts.schemaErrors).toBeGreaterThan(0);
    expect(r.hardPassed).toBe(false);
  });

  it("records a schema finding with rule='schema'", () => {
    const r = runGuard({ ...cleanInput(), draftJson: {} });
    expect(r.findings.some(f => f.rule === "schema")).toBe(true);
  });

  it("schema finding has level='error'", () => {
    const r = runGuard({ ...cleanInput(), draftJson: {} });
    const f = r.findings.find(f => f.rule === "schema");
    expect(f?.level).toBe("error");
  });

  it("missing limitations array causes schema failure", () => {
    const draft = validDraftJson();
    delete (draft as Record<string, unknown>)["limitations"];
    const r = runGuard({ ...cleanInput(), draftJson: draft });
    expect(r.counts.schemaErrors).toBeGreaterThan(0);
  });
});

// ============================================================
// Quote-lock rule
// ============================================================

describe("runGuard — quote-lock rule", () => {
  it("passes when no witnessed citations are provided", () => {
    const r = runGuard(cleanInput());
    expect(r.counts.quoteLockErrors).toBe(0);
  });

  it("passes a valid witnessed citation with matching hash", () => {
    const quote = "The exact quote text.";
    const cit: GuardCitationInput = {
      claimId:      makeUuid(),
      fragmentText: "Preamble. " + quote + " Epilogue.",
      claimType:    "witnessed",
      quote,
      quoteHash:    sha256(quote),
    };
    const r = runGuard({ ...cleanInput(), citations: [cit] });
    expect(r.counts.quoteLockErrors).toBe(0);
  });

  it("fails when witnessed citation has wrong quoteHash", () => {
    const quote = "The exact quote text.";
    const cit: GuardCitationInput = {
      claimId:      makeUuid(),
      fragmentText: "Preamble. " + quote + " Epilogue.",
      claimType:    "witnessed",
      quote,
      quoteHash:    sha256("wrong text"),
    };
    const r = runGuard({ ...cleanInput(), citations: [cit] });
    expect(r.counts.quoteLockErrors).toBe(1);
    expect(r.hardPassed).toBe(false);
  });

  it("fails when witnessed quote is not a substring of fragmentText", () => {
    const cit: GuardCitationInput = {
      claimId:      makeUuid(),
      fragmentText: "Something completely different.",
      claimType:    "witnessed",
      quote:        "Not in fragment.",
      quoteHash:    sha256("Not in fragment."),
    };
    const r = runGuard({ ...cleanInput(), citations: [cit] });
    expect(r.counts.quoteLockErrors).toBe(1);
  });

  it("skips quote-lock for non-witnessed citations", () => {
    const cit: GuardCitationInput = {
      claimId:      makeUuid(),
      fragmentText: "Fragment text.",
      claimType:    "inferred",
      quote:        null,
      quoteHash:    null,
    };
    const r = runGuard({ ...cleanInput(), citations: [cit] });
    expect(r.counts.quoteLockErrors).toBe(0);
  });
});

// ============================================================
// Unsupported rule
// ============================================================

describe("runGuard — unsupported rule", () => {
  it("passes when no claims have unsupported status", () => {
    const claim: GuardClaimInput = {
      id: makeUuid(), claimType: "witnessed", supportStatus: "supported",
      contradictionStatus: "none", negativeEvidenceNote: "No contrary evidence found.",
    };
    const r = runGuard({ ...cleanInput(), claims: [claim] });
    expect(r.counts.unsupportedBlocks).toBe(0);
  });

  it("records unsupported block when a claim has support_status=unsupported", () => {
    const claim: GuardClaimInput = {
      id: makeUuid(), claimType: "witnessed", supportStatus: "unsupported",
      contradictionStatus: "none", negativeEvidenceNote: null,
    };
    const r = runGuard({ ...cleanInput(), claims: [claim] });
    expect(r.counts.unsupportedBlocks).toBe(1);
    expect(r.softPassed).toBe(false);
  });

  it("unsupported claim forces NEEDS_REVIEW", () => {
    const claim: GuardClaimInput = {
      id: makeUuid(), claimType: "witnessed", supportStatus: "unsupported",
      contradictionStatus: "none", negativeEvidenceNote: null,
    };
    const r = runGuard({ ...cleanInput(), claims: [claim] });
    expect(guardResultToTransition(r)).toBe("NEEDS_REVIEW");
  });
});

// ============================================================
// Contradiction rule
// ============================================================

describe("runGuard — contradiction rule", () => {
  it("passes when no claims have contradiction_status=flagged", () => {
    const r = runGuard(cleanInput());
    expect(r.counts.contradictions).toBe(0);
  });

  it("records contradiction when a claim has contradiction_status=flagged", () => {
    const claim: GuardClaimInput = {
      id: makeUuid(), claimType: "witnessed", supportStatus: "supported",
      contradictionStatus: "flagged", negativeEvidenceNote: "See conflict note.",
    };
    const r = runGuard({ ...cleanInput(), claims: [claim] });
    expect(r.counts.contradictions).toBe(1);
    expect(r.softPassed).toBe(false);
  });

  it("flagged contradiction forces NEEDS_REVIEW", () => {
    const claim: GuardClaimInput = {
      id: makeUuid(), claimType: "inferred", supportStatus: "weak",
      contradictionStatus: "flagged", negativeEvidenceNote: null,
    };
    const r = runGuard({ ...cleanInput(), claims: [claim] });
    expect(guardResultToTransition(r)).toBe("NEEDS_REVIEW");
  });

  it("resolved contradiction does not block", () => {
    const claim: GuardClaimInput = {
      id: makeUuid(), claimType: "witnessed", supportStatus: "supported",
      contradictionStatus: "resolved", negativeEvidenceNote: "No contrary evidence found.",
    };
    const r = runGuard({ ...cleanInput(), claims: [claim] });
    expect(r.counts.contradictions).toBe(0);
  });
});

// ============================================================
// Negative evidence rule
// ============================================================

describe("runGuard — negative evidence rule", () => {
  it("passes when supported claim has a non-empty negativeEvidenceNote", () => {
    const claim: GuardClaimInput = {
      id: makeUuid(), claimType: "witnessed", supportStatus: "supported",
      contradictionStatus: "none", negativeEvidenceNote: "No contrary evidence found.",
    };
    const r = runGuard({ ...cleanInput(), claims: [claim] });
    expect(r.counts.negEvidenceErrors).toBe(0);
  });

  it("fails when supported claim is missing negativeEvidenceNote", () => {
    const claim: GuardClaimInput = {
      id: makeUuid(), claimType: "witnessed", supportStatus: "supported",
      contradictionStatus: "none", negativeEvidenceNote: null,
    };
    const r = runGuard({ ...cleanInput(), claims: [claim] });
    expect(r.counts.negEvidenceErrors).toBe(1);
    expect(r.softPassed).toBe(false);
  });

  it("fails when inferred claim is missing negativeEvidenceNote", () => {
    const claim: GuardClaimInput = {
      id: makeUuid(), claimType: "inferred", supportStatus: "weak",
      contradictionStatus: "none", negativeEvidenceNote: undefined,
    };
    const r = runGuard({ ...cleanInput(), claims: [claim] });
    expect(r.counts.negEvidenceErrors).toBe(1);
  });

  it("missing negative evidence forces NEEDS_REVIEW", () => {
    const claim: GuardClaimInput = {
      id: makeUuid(), claimType: "witnessed", supportStatus: "supported",
      contradictionStatus: "none", negativeEvidenceNote: null,
    };
    const r = runGuard({ ...cleanInput(), claims: [claim] });
    expect(guardResultToTransition(r)).toBe("NEEDS_REVIEW");
  });

  it("unsupported claim does not trigger neg-evidence rule (not required)", () => {
    const claim: GuardClaimInput = {
      id: makeUuid(), claimType: "witnessed", supportStatus: "unsupported",
      contradictionStatus: "none", negativeEvidenceNote: null,
    };
    const r = runGuard({ ...cleanInput(), claims: [claim] });
    expect(r.counts.negEvidenceErrors).toBe(0);
  });
});

// ============================================================
// Terminology drift rule
// ============================================================

describe("runGuard — terminology drift rule", () => {
  it("passes when draft terminology is empty", () => {
    const r = runGuard(cleanInput());
    expect(r.counts.terminologyDrifts).toBe(0);
  });

  it("passes when all draft terms are in registeredTerms", () => {
    const draft = validDraftJson() as Record<string, unknown>;
    (draft["terminology"] as unknown[]) = [
      { term: "ADR", definition: "Architecture Decision Record", entryId: makeUuid() },
    ];
    const r = runGuard({
      draftJson:       draft,
      claims:          [],
      citations:       [],
      registeredTerms: new Set(["ADR"]),
    });
    expect(r.counts.terminologyDrifts).toBe(0);
  });

  it("fails when a draft term is not in registeredTerms", () => {
    const draft = validDraftJson() as Record<string, unknown>;
    (draft["terminology"] as unknown[]) = [
      { term: "UnregisteredTerm", definition: "Some definition", entryId: makeUuid() },
    ];
    const r = runGuard({
      draftJson:       draft,
      claims:          [],
      citations:       [],
      registeredTerms: new Set(),
    });
    expect(r.counts.terminologyDrifts).toBe(1);
    expect(r.softPassed).toBe(false);
  });

  it("terminology drift forces NEEDS_REVIEW", () => {
    const draft = validDraftJson() as Record<string, unknown>;
    (draft["terminology"] as unknown[]) = [
      { term: "Drifted", definition: "Not in registry", entryId: makeUuid() },
    ];
    const r = runGuard({
      draftJson:       draft,
      claims:          [],
      citations:       [],
      registeredTerms: new Set(),
    });
    expect(guardResultToTransition(r)).toBe("NEEDS_REVIEW");
  });
});

// ============================================================
// guardResultToTransition
// ============================================================

describe("guardResultToTransition", () => {
  it("returns APPROVED when hardPassed=true and softPassed=true", () => {
    const result = runGuard(cleanInput());
    expect(guardResultToTransition(result)).toBe("APPROVED");
  });

  it("returns NEEDS_REVIEW when hardPassed=false", () => {
    const r = runGuard({ ...cleanInput(), draftJson: { invalid: true } });
    expect(guardResultToTransition(r)).toBe("NEEDS_REVIEW");
  });

  it("returns NEEDS_REVIEW when softPassed=false even if hardPassed=true", () => {
    const claim: GuardClaimInput = {
      id: makeUuid(), claimType: "witnessed", supportStatus: "unsupported",
      contradictionStatus: "none", negativeEvidenceNote: null,
    };
    const r = runGuard({ ...cleanInput(), claims: [claim] });
    expect(r.hardPassed).toBe(true);
    expect(guardResultToTransition(r)).toBe("NEEDS_REVIEW");
  });

  it("APPROVED is never RELEASED (workflow gate)", () => {
    const result = runGuard(cleanInput());
    const next = guardResultToTransition(result);
    expect(next).not.toBe("RELEASED");
  });

  it("NEEDS_REVIEW is never RELEASED", () => {
    const claim: GuardClaimInput = {
      id: makeUuid(), claimType: "witnessed", supportStatus: "unsupported",
      contradictionStatus: "none", negativeEvidenceNote: null,
    };
    const r = runGuard({ ...cleanInput(), claims: [claim] });
    expect(guardResultToTransition(r)).not.toBe("RELEASED");
  });
});

// ============================================================
// Capability guard
// ============================================================

describe("runGuard — capability guard", () => {
  it("AlinaGuard holds RUN_VALIDATION (guard runs without throwing)", () => {
    expect(() => runGuard(cleanInput())).not.toThrow();
  });

  it("AlinaGuard cannot RELEASE", () => {
    expect(() => assertAgentCapability("AlinaGuard", "RELEASE")).toThrow(CapabilityDeniedError);
  });

  it("AlinaGuard cannot EXPORT", () => {
    expect(() => assertAgentCapability("AlinaGuard", "EXPORT")).toThrow(CapabilityDeniedError);
  });

  it("AlinaGuard cannot WRITE_DRAFT", () => {
    expect(() => assertAgentCapability("AlinaGuard", "WRITE_DRAFT")).toThrow(CapabilityDeniedError);
  });
});

// ============================================================
// Multiple simultaneous soft blocks
// ============================================================

describe("runGuard — multiple soft blocks", () => {
  it("accumulates findings from multiple rule violations", () => {
    const unsupportedClaim: GuardClaimInput = {
      id: makeUuid(), claimType: "witnessed", supportStatus: "unsupported",
      contradictionStatus: "flagged", negativeEvidenceNote: null,
    };
    const r = runGuard({ ...cleanInput(), claims: [unsupportedClaim] });
    // unsupported + contradiction = 2 soft blocks
    expect(r.counts.unsupportedBlocks).toBe(1);
    expect(r.counts.contradictions).toBe(1);
    expect(r.findings.length).toBeGreaterThanOrEqual(2);
    expect(r.softPassed).toBe(false);
  });

  it("hardPassed=true with multiple soft blocks (schema and quote-lock were fine)", () => {
    const claim: GuardClaimInput = {
      id: makeUuid(), claimType: "witnessed", supportStatus: "supported",
      contradictionStatus: "flagged", negativeEvidenceNote: null,
    };
    const r = runGuard({ ...cleanInput(), claims: [claim] });
    expect(r.hardPassed).toBe(true);
    expect(r.softPassed).toBe(false);
  });
});
