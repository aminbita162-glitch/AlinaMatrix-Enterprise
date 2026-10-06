/**
 * Tests for packages/renderer/src/beachhead.ts — operator beachhead path.
 *
 * Directive Phase B:
 *   "One operator path from an approved M03 content model to HTML and
 *    manifest through the fake provider. Same inputs, same HTML sha256."
 *
 * Covers:
 *   - renderBeachhead produces HTML, htmlSha256, and a manifest.
 *   - Same inputs produce the same htmlSha256 (replay determinism).
 *   - Same inputs produce the same manifest (deep equality).
 *   - Different content produces a different htmlSha256.
 *   - The fake provider is called (providerOutputHash is present and stable).
 *   - Unknown assertion keys in the content are dropped from the HTML.
 *   - The manifest pins every version input + the HTML sha256.
 *   - Invalid content (schema violation) is rejected.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { renderBeachhead } from "./beachhead.js";
import type { M03ContentModel, Watermark } from "@alinamatrix/contracts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_UUID = "00000000-0000-4000-8000-000000000000";
const BUILD_ID   = "11111111-1111-4111-8111-111111111111";
const BUILD_TIME = "2026-10-06T12:00:00.000Z";

const baseWatermark: Pick<Watermark, "tenantId" | "artifactVersion" | "buildId" | "buildTime"> = {
  tenantId:        BASE_UUID,
  artifactVersion: 1,
  buildId:         BUILD_ID,
  buildTime:       BUILD_TIME,
};

const baseContent: M03ContentModel = {
  metadata: {
    id:              BASE_UUID,
    title:           "Beachhead ADR",
    version:         1,
    projectId:       BASE_UUID,
    tenantId:        BASE_UUID,
    workflowRunId:   BASE_UUID,
    createdAt:       "2026-10-06T12:00:00.000Z",
    documentType:    "M03",
    productSentence: "Turn complex evidence into auditable professional artifacts.",
    statusLine:      "Enterprise Candidate  -  Active Development",
  },
  context: {
    background:       "Background text for beachhead",
    problemStatement: "Problem statement for beachhead",
  },
  decision: {
    decisionStatement: "We adopt the beachhead option.",
    decisionOwner:     "owner-beachhead",
    decisionDate:      "2026-10-06",
  },
  status: { value: "proposed", context: "Initial beachhead proposal" },
  drivers: [{ id: "d1", description: "Driver one", type: "constraint" }],
  options: [
    { id: "opt-a", title: "Option A", description: "First option", pros: ["pro1"], cons: ["con1"] },
    { id: "opt-b", title: "Option B", description: "Second option", pros: [], cons: ["con2"] },
  ],
  outcome: { chosenOptionId: "opt-a", rationale: "Option A best fits constraints." },
  consequences: [{ description: "Consequence one", type: "positive" }],
  evidenceMap: [{ fragmentId: BASE_UUID, sourceVersionId: BASE_UUID, relevanceNote: "Relevant" }],
  claimAtoms: [{ claimId: BASE_UUID, role: "supports", inlineNote: "Supports the decision" }],
  assumptions: [{ id: "a1", statement: "Assumption one", risk: "If wrong, plan fails", owner: "owner-1" }],
  negativeEvidence: [{ claimId: BASE_UUID, note: "Negative evidence note" }],
  terminology: [{ term: "ADR", definition: "Architecture Decision Record", entryId: BASE_UUID }],
  risks: [{ id: "r1", description: "Risk one", likelihood: "low", impact: "medium" }],
  openQuestions: [{ id: "q1", question: "Question one", raisedBy: "owner-1", status: "open" }],
  review: [{ reviewerId: BASE_UUID, reviewDate: "2026-10-06", recommendation: "approve" }],
  approval: [{ approverId: BASE_UUID, approvalDate: "2026-10-06", signature: "sig-beachhead", authorId: BASE_UUID }],
  limitations: [{ description: "PDF not built", category: "technical" }],
};

function makeInput(overrides: Partial<ReturnType<typeof baseBeachheadInput>> = {}): ReturnType<typeof baseBeachheadInput> {
  return { ...baseBeachheadInput(), ...overrides };
}

function baseBeachheadInput() {
  return {
    content: baseContent,
    watermark: baseWatermark,
    sourceVersionIds: [BASE_UUID],
    pins: {
      promptSha256:    "a".repeat(64),
      schemaSha256:    "b".repeat(64),
      policySha256:    "c".repeat(64),
      modelId:         "deterministic-fake-v1",
      promptVersionId: BASE_UUID,
      modelVersionId:  BASE_UUID,
      schemaVersionId: BASE_UUID,
      policyVersionId: BASE_UUID,
    },
    renderer: "html-static-v1",
    template: "m03-adr-v1",
  };
}

// ---------------------------------------------------------------------------
// renderBeachhead — basic output shape
// ---------------------------------------------------------------------------

describe("renderBeachhead — output shape", () => {
  it("produces HTML, htmlSha256, and a manifest", () => {
    const result = renderBeachhead(makeInput());
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain("</html>");
    expect(result.htmlSha256).toHaveLength(64);
    expect(result.htmlSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.manifest).toBeDefined();
    expect(result.manifest.htmlSha256).toBe(result.htmlSha256);
  });

  it("produces a providerOutputHash and providerOutputJson", () => {
    const result = renderBeachhead(makeInput());
    expect(result.providerOutputHash).toHaveLength(64);
    expect(result.providerOutputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.providerOutputJson).toContain("DeterministicFakeProvider");
    expect(() => JSON.parse(result.providerOutputJson)).not.toThrow();
  });

  it("manifest pins every version input", () => {
    const input = makeInput();
    const result = renderBeachhead(input);
    expect(result.manifest.promptVersionId).toBe(input.pins.promptVersionId);
    expect(result.manifest.modelVersionId).toBe(input.pins.modelVersionId);
    expect(result.manifest.schemaVersionId).toBe(input.pins.schemaVersionId);
    expect(result.manifest.policyVersionId).toBe(input.pins.policyVersionId);
    expect(result.manifest.renderer).toBe(input.renderer);
    expect(result.manifest.template).toBe(input.template);
    expect(result.manifest.buildId).toBe(BUILD_ID);
    expect(result.manifest.buildTime).toBe(BUILD_TIME);
    expect(result.manifest.sourceVersionIds).toEqual(input.sourceVersionIds);
  });
});

// ---------------------------------------------------------------------------
// renderBeachhead — replay determinism
// ---------------------------------------------------------------------------

describe("renderBeachhead — replay determinism", () => {
  it("same inputs produce the same htmlSha256", () => {
    const input = makeInput();
    const a = renderBeachhead(input);
    const b = renderBeachhead(input);
    expect(a.htmlSha256).toBe(b.htmlSha256);
  });

  it("same inputs produce the same HTML string", () => {
    const input = makeInput();
    const a = renderBeachhead(input);
    const b = renderBeachhead(input);
    expect(a.html).toBe(b.html);
  });

  it("same inputs produce the same manifest (deep equality)", () => {
    const input = makeInput();
    const a = renderBeachhead(input);
    const b = renderBeachhead(input);
    expect(a.manifest).toEqual(b.manifest);
  });

  it("same inputs produce the same providerOutputHash", () => {
    const input = makeInput();
    const a = renderBeachhead(input);
    const b = renderBeachhead(input);
    expect(a.providerOutputHash).toBe(b.providerOutputHash);
  });

  it("10 iterations produce identical htmlSha256", () => {
    const input = makeInput();
    const hashes: string[] = [];
    for (let i = 0; i < 10; i++) {
      hashes.push(renderBeachhead(input).htmlSha256);
    }
    expect(new Set(hashes).size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// renderBeachhead — content sensitivity
// ---------------------------------------------------------------------------

describe("renderBeachhead — content sensitivity", () => {
  it("different content produces a different htmlSha256", () => {
    const inputA = makeInput();
    const contentB: M03ContentModel = JSON.parse(JSON.stringify(baseContent));
    (contentB.metadata as M03ContentModel["metadata"]).title = "Different Beachhead ADR";
    const inputB = makeInput({ content: contentB });
    const a = renderBeachhead(inputA);
    const b = renderBeachhead(inputB);
    expect(a.htmlSha256).not.toBe(b.htmlSha256);
  });

  it("different pins produce a different providerOutputHash", () => {
    const inputA = makeInput();
    const inputB = makeInput({
      pins: {
        ...inputA.pins,
        promptSha256: "d".repeat(64),
      },
    });
    const a = renderBeachhead(inputA);
    const b = renderBeachhead(inputB);
    expect(a.providerOutputHash).not.toBe(b.providerOutputHash);
  });

  it("different buildId changes the manifest but not the providerOutputHash", () => {
    const inputA = makeInput();
    const inputB = makeInput({
      watermark: {
        ...baseWatermark,
        buildId: "22222222-2222-4222-8222-222222222222",
      },
    });
    const a = renderBeachhead(inputA);
    const b = renderBeachhead(inputB);
    expect(a.providerOutputHash).toBe(b.providerOutputHash);
    expect(a.manifest.buildId).not.toBe(b.manifest.buildId);
  });
});

// ---------------------------------------------------------------------------
// renderBeachhead — unknown assertion keys dropped
// ---------------------------------------------------------------------------

describe("renderBeachhead — unknown assertion keys dropped", () => {
  it("does not render unknown keys added to the content object", () => {
    // M03ContentModelSchema.parse strips unknown keys (Zod default), so we
    // add an unknown key to the raw content and verify it does not appear
    // in the HTML. The schema validation removes it before render.
    const contentWithUnknown = {
      ...baseContent,
      bogusInventedKey: { fakeClaim: "FAKE_UNKNOWN_CLAIM" },
    };
    const input = makeInput({ content: contentWithUnknown as unknown as M03ContentModel });
    const result = renderBeachhead(input);
    expect(result.html).not.toContain("bogusInventedKey");
    expect(result.html).not.toContain("FAKE_UNKNOWN_CLAIM");
  });
});

// ---------------------------------------------------------------------------
// renderBeachhead — watermark + status line in HTML
// ---------------------------------------------------------------------------

describe("renderBeachhead — watermark in HTML", () => {
  it("embeds the watermark meta tags in the HTML", () => {
    const result = renderBeachhead(makeInput());
    expect(result.html).toContain('name="x-alinamatrix-tenant"');
    expect(result.html).toContain('name="x-alinamatrix-artifact-version"');
    expect(result.html).toContain('name="x-alinamatrix-build-id"');
    expect(result.html).toContain('name="x-alinamatrix-build-time"');
    expect(result.html).toContain("Enterprise Candidate  -  Active Development");
  });
});

// ---------------------------------------------------------------------------
// renderBeachhead — validation rejection
// ---------------------------------------------------------------------------

describe("renderBeachhead — validation", () => {
  it("rejects content that does not satisfy M03ContentModelSchema", () => {
    const invalidContent = { ...baseContent, metadata: { ...baseContent.metadata, title: "" } };
    expect(() =>
      renderBeachhead(makeInput({ content: invalidContent as unknown as M03ContentModel })),
    ).toThrow();
  });

  it("rejects an invalid watermark (bad tenantId)", () => {
    expect(() =>
      renderBeachhead(makeInput({
        watermark: { ...baseWatermark, tenantId: "not-a-uuid" },
      })),
    ).toThrow();
  });
});
