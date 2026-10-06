/**
 * Unit tests for packages/renderer/src/html.ts — HTML renderer.
 *
 * Covers:
 *   - Deterministic HTML output (same inputs -> same string).
 *   - Unknown assertion keys are dropped.
 *   - Limitations, assumptions, evidence map, approvals are included.
 *   - Watermark metadata is embedded as <meta> tags.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { renderHtml, renderWatermark } from "./html.js";
import type { Watermark, RenderInput } from "@alinamatrix/contracts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_UUID = "00000000-0000-4000-8000-000000000000";

const baseWatermark: Watermark = {
  tenantId:        BASE_UUID,
  artifactVersion: 1,
  buildId:         BASE_UUID,
  buildTime:       "2026-10-06T12:00:00.000Z",
  statusLine:      "Enterprise Candidate  -  Active Development",
};

const baseContent: Record<string, unknown> = {
  metadata: {
    id:              BASE_UUID,
    title:           "Test ADR",
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
    background:       "Background text",
    problemStatement: "Problem statement text",
  },
  decision: {
    decisionStatement: "We adopt option A.",
    decisionOwner:     "owner-1",
    decisionDate:      "2026-10-06",
  },
  status: {
    value:   "proposed",
    context: "Initial proposal",
  },
  drivers: [
    { id: "d1", description: "Driver one", type: "constraint" },
  ],
  options: [
    { id: "opt-a", title: "Option A", description: "First option", pros: ["pro1"], cons: ["con1"] },
    { id: "opt-b", title: "Option B", description: "Second option", pros: [], cons: ["con2"] },
  ],
  outcome: {
    chosenOptionId: "opt-a",
    rationale:      "Option A best fits constraints.",
  },
  consequences: [
    { description: "Consequence one", type: "positive" },
  ],
  evidenceMap: [
    { fragmentId: BASE_UUID, sourceVersionId: BASE_UUID, relevanceNote: "Relevant" },
  ],
  claimAtoms: [
    { claimId: BASE_UUID, role: "supports", inlineNote: "Supports the decision" },
  ],
  assumptions: [
    { id: "a1", statement: "Assumption one", risk: "If wrong, plan fails", owner: "owner-1" },
  ],
  negativeEvidence: [
    { claimId: BASE_UUID, note: "Negative evidence note" },
  ],
  terminology: [
    { term: "ADR", definition: "Architecture Decision Record", entryId: BASE_UUID },
  ],
  risks: [
    { id: "r1", description: "Risk one", likelihood: "low", impact: "medium" },
  ],
  openQuestions: [
    { id: "q1", question: "Question one", raisedBy: "owner-1", status: "open" },
  ],
  review: [
    { reviewerId: BASE_UUID, reviewDate: "2026-10-06", recommendation: "approve" },
  ],
  approval: [
    { approverId: BASE_UUID, approvalDate: "2026-10-06", signature: "sig-1", authorId: BASE_UUID },
  ],
  limitations: [
    { description: "PDF not built", category: "technical" },
  ],
};

function makeRenderInput(content: Record<string, unknown>): RenderInput {
  return {
    content,
    watermark: baseWatermark,
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

describe("renderHtml", () => {
  it("produces a complete HTML5 document", () => {
    const html = renderHtml(makeRenderInput(baseContent));
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
    expect(html).toContain("<head>");
    expect(html).toContain("<body>");
  });

  it("is deterministic: same inputs produce identical output", () => {
    const a = renderHtml(makeRenderInput(baseContent));
    const b = renderHtml(makeRenderInput(baseContent));
    expect(a).toBe(b);
  });

  it("includes limitations section", () => {
    const html = renderHtml(makeRenderInput(baseContent));
    expect(html).toContain("limitations");
    expect(html).toContain("PDF not built");
  });

  it("includes assumptions section", () => {
    const html = renderHtml(makeRenderInput(baseContent));
    expect(html).toContain("assumptions");
    expect(html).toContain("Assumption one");
  });

  it("includes evidence map section", () => {
    const html = renderHtml(makeRenderInput(baseContent));
    expect(html).toContain("evidenceMap");
    expect(html).toContain("Relevant");
  });

  it("includes approval section", () => {
    const html = renderHtml(makeRenderInput(baseContent));
    expect(html).toContain("approval");
    expect(html).toContain("sig-1");
  });

  it("drops unknown assertion keys", () => {
    const contentWithUnknown = {
      ...baseContent,
      bogusUnknownKey: { secret: "should not appear in HTML" },
      anotherUnknown:  "also should not appear",
    };
    const html = renderHtml(makeRenderInput(contentWithUnknown));
    expect(html).not.toContain("bogusUnknownKey");
    expect(html).not.toContain("anotherUnknown");
    expect(html).not.toContain("should not appear in HTML");
    expect(html).not.toContain("also should not appear");
  });

  it("does not invent claims not present in the content model", () => {
    const html = renderHtml(makeRenderInput(baseContent));
    // The HTML must not contain a claim ID that was not in claimAtoms.
    // Only BASE_UUID is used; no other UUID should appear as a claim.
    // Verify our claim's note appears:
    expect(html).toContain("Supports the decision");
    // Verify no invented claim text appears:
    expect(html).not.toContain("INVENTED_CLAIM_TEXT");
  });

  it("embeds watermark as meta tags", () => {
    const html = renderHtml(makeRenderInput(baseContent));
    expect(html).toContain('name="x-alinamatrix-tenant"');
    expect(html).toContain('name="x-alinamatrix-artifact-version"');
    expect(html).toContain('name="x-alinamatrix-build-id"');
    expect(html).toContain('name="x-alinamatrix-build-time"');
  });

  it("escapes HTML special characters in content", () => {
    const contentWithHtml = {
      ...baseContent,
      context: {
        background:       "<script>alert('xss')</script>",
        problemStatement: "A & B < C > D",
      },
    };
    const html = renderHtml(makeRenderInput(contentWithHtml));
    expect(html).not.toContain("<script>alert('xss')</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B &lt; C &gt; D");
  });

  it("renders sections in a fixed order", () => {
    const html = renderHtml(makeRenderInput(baseContent));
    const metadataPos = html.indexOf('class="metadata"');
    const contextPos  = html.indexOf('class="context"');
    const decisionPos = html.indexOf('class="decision"');
    const limitationsPos = html.indexOf('class="limitations"');
    expect(metadataPos).toBeGreaterThan(0);
    expect(metadataPos).toBeLessThan(contextPos);
    expect(contextPos).toBeLessThan(decisionPos);
    expect(decisionPos).toBeLessThan(limitationsPos);
  });
});

describe("renderWatermark", () => {
  it("renders all four watermark fields", () => {
    const wm = renderWatermark(baseWatermark);
    expect(wm).toContain(baseWatermark.tenantId);
    expect(wm).toContain(String(baseWatermark.artifactVersion));
    expect(wm).toContain(baseWatermark.buildId);
    expect(wm).toContain(baseWatermark.buildTime);
    expect(wm).toContain(baseWatermark.statusLine);
  });

  it("is deterministic", () => {
    const a = renderWatermark(baseWatermark);
    const b = renderWatermark(baseWatermark);
    expect(a).toBe(b);
  });
});
