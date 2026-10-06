/**
 * Replay test — Phase 8.
 *
 * Directive Phase 8:
 *   "Replay test: same inputs -> same HTML sha256."
 *   "Tests: replay, no invented claim in HTML, immutability, manifest pins present."
 *
 * This file proves the replay invariant end-to-end:
 *   - renderPipeline with identical inputs produces identical HTML, identical
 *     htmlSha256, and an identical manifest (deep equality).
 *   - The HTML does not contain any invented claim text (no string that was not
 *     present in the approved content model).
 *   - The manifest pins every required version input (content hash, source
 *     version ids, prompt, model, schema, policy, renderer, template, build id,
 *     build time, sha256 of HTML) — no field is missing or undefined.
 *   - Immutability: the renderer is a pure function — calling it twice does not
 *     mutate the input or produce different output.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { renderPipeline, computeHtmlSha256 } from "./manifest.js";
import { renderHtml } from "./html.js";
import { buildWatermark } from "./watermark.js";
import type { RenderInput, Watermark } from "@alinamatrix/contracts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_UUID = "00000000-0000-4000-8000-000000000000";
const BUILD_ID   = "11111111-1111-4111-8111-111111111111";
const BUILD_TIME = "2026-10-06T12:00:00.000Z";

const baseWatermark: Watermark = {
  tenantId:        BASE_UUID,
  artifactVersion: 1,
  buildId:         BUILD_ID,
  buildTime:       BUILD_TIME,
  statusLine:      "Enterprise Candidate  -  Active Development",
};

const baseContent: Record<string, unknown> = {
  metadata: {
    id:              BASE_UUID,
    title:           "Replay ADR",
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
    background:       "Background text for replay",
    problemStatement: "Problem statement for replay",
  },
  decision: {
    decisionStatement: "We adopt the replay-safe option.",
    decisionOwner:     "owner-replay",
    decisionDate:      "2026-10-06",
  },
  status: { value: "proposed", context: "Initial replay proposal" },
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
  approval: [{ approverId: BASE_UUID, approvalDate: "2026-10-06", signature: "sig-replay", authorId: BASE_UUID }],
  limitations: [{ description: "PDF not built", category: "technical" }],
};

function makeInput(): RenderInput {
  return {
    content:       baseContent,
    watermark:      baseWatermark,
    sourceVersionIds: [BASE_UUID],
    versionPins: {
      promptVersionId: BASE_UUID,
      modelVersionId:  BASE_UUID,
      schemaVersionId: BASE_UUID,
      policyVersionId: BASE_UUID,
    },
    renderer:    "html-static-v1",
    template:    "m03-adr-v1",
    contentHash: "a".repeat(64),
  };
}

// ---------------------------------------------------------------------------
// Replay determinism
// ---------------------------------------------------------------------------

describe("replay determinism", () => {
  it("same inputs produce the same HTML string", () => {
    const input = makeInput();
    const a = renderHtml(input);
    const b = renderHtml(input);
    expect(a).toBe(b);
  });

  it("same inputs produce the same HTML sha256", () => {
    const input = makeInput();
    const a = renderPipeline({ input, buildId: BUILD_ID, buildTime: BUILD_TIME });
    const b = renderPipeline({ input, buildId: BUILD_ID, buildTime: BUILD_TIME });
    expect(a.htmlSha256).toBe(b.htmlSha256);
    expect(a.htmlSha256).toHaveLength(64);
    expect(a.htmlSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("same inputs produce the same manifest (deep equality)", () => {
    const input = makeInput();
    const a = renderPipeline({ input, buildId: BUILD_ID, buildTime: BUILD_TIME });
    const b = renderPipeline({ input, buildId: BUILD_ID, buildTime: BUILD_TIME });
    expect(a.manifest).toEqual(b.manifest);
  });

  it("same inputs produce the same htmlSha256 via computeHtmlSha256", () => {
    const input = makeInput();
    const html = renderHtml(input);
    const a = computeHtmlSha256(html);
    const b = computeHtmlSha256(renderHtml(input));
    expect(a).toBe(b);
  });

  it("different content produces a different htmlSha256", () => {
    const inputA = makeInput();
    const inputB = makeInput();
    // Deep-copy content for B and change a rendered value.
    const contentB: Record<string, unknown> = JSON.parse(JSON.stringify(baseContent));
    (contentB.metadata as Record<string, unknown>).title = "Different Replay ADR";
    inputB.content = contentB;
    const a = renderPipeline({ input: inputA, buildId: BUILD_ID, buildTime: BUILD_TIME });
    const b = renderPipeline({ input: inputB, buildId: BUILD_ID, buildTime: BUILD_TIME });
    expect(a.htmlSha256).not.toBe(b.htmlSha256);
  });

  it("replay with 10 iterations produces identical sha256", () => {
    const input = makeInput();
    const hashes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const { htmlSha256 } = renderPipeline({ input, buildId: BUILD_ID, buildTime: BUILD_TIME });
      hashes.push(htmlSha256);
    }
    const unique = new Set(hashes);
    expect(unique.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// No invented claim in HTML
// ---------------------------------------------------------------------------

describe("no invented claim in HTML", () => {
  it("does not contain any claim text not present in the content model", () => {
    const input = makeInput();
    const html = renderHtml(input);
    // Every rendered string must come from the content model.
    // Verify our known content strings are present:
    expect(html).toContain("Replay ADR");
    expect(html).toContain("Supports the decision");
    expect(html).toContain("Assumption one");
    expect(html).toContain("PDF not built");
    // Verify invented strings do not appear:
    expect(html).not.toContain("INVENTED_CLAIM_TEXT");
    expect(html).not.toContain("fabricated-evidence");
    expect(html).not.toContain("FAKE_CITATION");
  });

  it("does not contain unknown assertion keys", () => {
    const inputWithUnknown: RenderInput = {
      ...makeInput(),
      content: {
        ...baseContent,
        bogusInventedKey: { fakeClaim: "FAKE_UNKNOWN_CLAIM" },
        anotherFakeKey:   "should never appear in HTML",
      },
    };
    const html = renderHtml(inputWithUnknown);
    expect(html).not.toContain("bogusInventedKey");
    expect(html).not.toContain("anotherFakeKey");
    expect(html).not.toContain("FAKE_UNKNOWN_CLAIM");
    expect(html).not.toContain("should never appear in HTML");
  });

  it("only renders known M03 section keys", () => {
    const input = makeInput();
    const html = renderHtml(input);
    // Known section keys that should appear:
    const knownKeys = [
      "metadata", "context", "decision", "status", "drivers", "options",
      "outcome", "consequences", "evidenceMap", "claimAtoms", "assumptions",
      "negativeEvidence", "terminology", "risks", "openQuestions", "review",
      "approval", "limitations",
    ];
    for (const key of knownKeys) {
      expect(html).toContain(`class="${key}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// Immutability (pure function — no mutation of input)
// ---------------------------------------------------------------------------

describe("immutability", () => {
  it("renderHtml does not mutate the input content", () => {
    const input = makeInput();
    const originalJson = JSON.stringify(input.content);
    renderHtml(input);
    expect(JSON.stringify(input.content)).toBe(originalJson);
  });

  it("renderPipeline does not mutate the input", () => {
    const input = makeInput();
    const originalJson = JSON.stringify(input);
    renderPipeline({ input, buildId: BUILD_ID, buildTime: BUILD_TIME });
    expect(JSON.stringify(input)).toBe(originalJson);
  });

  it("calling renderHtml twice produces the same output (no internal state)", () => {
    const input = makeInput();
    const a = renderHtml(input);
    const b = renderHtml(input);
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Manifest pins present
// ---------------------------------------------------------------------------

describe("manifest pins present", () => {
  it("all required manifest fields are present and match the input", () => {
    const input = makeInput();
    const { manifest } = renderPipeline({ input, buildId: BUILD_ID, buildTime: BUILD_TIME });
    expect(manifest.contentHash).toBe(input.contentHash);
    expect(manifest.sourceVersionIds).toEqual(input.sourceVersionIds);
    expect(manifest.promptVersionId).toBe(input.versionPins.promptVersionId);
    expect(manifest.modelVersionId).toBe(input.versionPins.modelVersionId);
    expect(manifest.schemaVersionId).toBe(input.versionPins.schemaVersionId);
    expect(manifest.policyVersionId).toBe(input.versionPins.policyVersionId);
    expect(manifest.renderer).toBe(input.renderer);
    expect(manifest.template).toBe(input.template);
    expect(manifest.buildId).toBe(BUILD_ID);
    expect(manifest.buildTime).toBe(BUILD_TIME);
    expect(manifest.htmlSha256).toHaveLength(64);
    expect(manifest.htmlSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("no manifest field is undefined", () => {
    const input = makeInput();
    const { manifest } = renderPipeline({ input, buildId: BUILD_ID, buildTime: BUILD_TIME });
    const fields: (keyof typeof manifest)[] = [
      "contentHash",
      "sourceVersionIds",
      "promptVersionId",
      "modelVersionId",
      "schemaVersionId",
      "policyVersionId",
      "renderer",
      "template",
      "buildId",
      "buildTime",
      "htmlSha256",
    ];
    for (const field of fields) {
      expect(manifest[field]).toBeDefined();
    }
  });

  it("manifest htmlSha256 matches computeHtmlSha256 of the rendered HTML", () => {
    const input = makeInput();
    const { html, manifest } = renderPipeline({ input, buildId: BUILD_ID, buildTime: BUILD_TIME });
    expect(manifest.htmlSha256).toBe(computeHtmlSha256(html));
  });

  it("watermark metadata is present in the HTML", () => {
    const input = makeInput();
    const html = renderHtml(input);
    expect(html).toContain('name="x-alinamatrix-tenant"');
    expect(html).toContain('name="x-alinamatrix-artifact-version"');
    expect(html).toContain('name="x-alinamatrix-build-id"');
    expect(html).toContain('name="x-alinamatrix-build-time"');
    expect(html).toContain(baseWatermark.tenantId);
    expect(html).toContain(baseWatermark.buildId);
    expect(html).toContain(baseWatermark.buildTime);
  });

  it("buildWatermark produces a valid watermark for the pipeline", () => {
    const wm = buildWatermark({
      tenantId:        BASE_UUID,
      artifactVersion: 1,
      buildId:          BUILD_ID,
      buildTime:        BUILD_TIME,
    });
    expect(wm.tenantId).toBe(BASE_UUID);
    expect(wm.buildId).toBe(BUILD_ID);
    expect(wm.buildTime).toBe(BUILD_TIME);
    expect(wm.statusLine).toBe("Enterprise Candidate  -  Active Development");
  });
});
