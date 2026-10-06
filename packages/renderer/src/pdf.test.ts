/**
 * Unit tests for packages/renderer/src/pdf.ts — PDF renderer (Phase B).
 *
 * Covers:
 *   - renderPdf returns status="built" with real PDF bytes (pinned pdfkit).
 *   - PDF bytes start with the %PDF- magic header (real PDF, not fake).
 *   - bytes is a non-empty Uint8Array; sha256 is a 64-char hex string.
 *   - The sha256 is deterministic (same inputs → same sha256).
 *   - Watermark and status line text are embedded in the PDF.
 *   - Unknown assertion keys are dropped from the PDF text.
 *   - PdfNotAvailableError is a proper Error subclass.
 *   - computePdfContentSha256 is deterministic and matches the async sha256.
 *
 * Directive Phase B:
 *   "Emit real PDF bytes from that HTML. No remote PDF service. No fake bytes.
 *    Watermark and status line are in the PDF."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { renderPdf, computePdfContentSha256, PdfNotAvailableError } from "./pdf.js";
import type { RenderInput, Watermark } from "@alinamatrix/contracts";

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
    title:           "PDF Test ADR",
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
    background:       "Background text for PDF test",
    problemStatement: "Problem statement for PDF test",
  },
  decision: {
    decisionStatement: "We adopt the PDF option.",
    decisionOwner:     "owner-pdf",
    decisionDate:      "2026-10-06",
  },
  status: { value: "proposed", context: "Initial PDF proposal" },
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
  approval: [{ approverId: BASE_UUID, approvalDate: "2026-10-06", signature: "sig-pdf", authorId: BASE_UUID }],
  limitations: [{ description: "PDF not built", category: "technical" }],
};

function makeInput(content: Record<string, unknown> = baseContent): RenderInput {
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
// renderPdf — real PDF bytes
// ---------------------------------------------------------------------------

describe("renderPdf — real PDF bytes", () => {
  it("returns status='built'", async () => {
    const result = await renderPdf(makeInput());
    expect(result.status).toBe("built");
  });

  it("emits real PDF bytes (starts with %PDF-)", async () => {
    const result = await renderPdf(makeInput());
    expect(result.bytes).toBeDefined();
    expect(result.bytes!.length).toBeGreaterThan(0);
    const header = Buffer.from(result.bytes!.subarray(0, 5)).toString("ascii");
    expect(header).toBe("%PDF-");
  });

  it("bytes is a Uint8Array", async () => {
    const result = await renderPdf(makeInput());
    expect(result.bytes).toBeInstanceOf(Uint8Array);
  });

  it("sha256 is a 64-char hex string", async () => {
    const result = await renderPdf(makeInput());
    expect(result.sha256).toBeDefined();
    expect(result.sha256).toHaveLength(64);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reason is absent when status='built'", async () => {
    const result = await renderPdf(makeInput());
    expect(result.reason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// renderPdf — watermark and status line in the PDF
// ---------------------------------------------------------------------------

describe("renderPdf — watermark and status line", () => {
  it("includes the status line as visible text in the PDF", async () => {
    const result = await renderPdf(makeInput());
    const text = Buffer.from(result.bytes!).toString("latin1");
    // The status line is written as "Status: <statusLine>" in the PDF text.
    expect(text).toContain("Enterprise Candidate");
    expect(text).toContain("Active Development");
  });

  it("includes the watermark tenant, build id, and build time in the PDF", async () => {
    const result = await renderPdf(makeInput());
    const text = Buffer.from(result.bytes!).toString("latin1");
    expect(text).toContain(baseWatermark.tenantId);
    expect(text).toContain(baseWatermark.buildId);
    expect(text).toContain(baseWatermark.buildTime);
  });
});

// ---------------------------------------------------------------------------
// renderPdf — determinism
// ---------------------------------------------------------------------------

describe("renderPdf — determinism", () => {
  it("same inputs produce the same sha256", async () => {
    const a = await renderPdf(makeInput());
    const b = await renderPdf(makeInput());
    expect(a.sha256).toBe(b.sha256);
  });

  it("sha256 matches computePdfContentSha256 for the same input", async () => {
    const input = makeInput();
    const result = await renderPdf(input);
    const sync = computePdfContentSha256(input);
    expect(result.sha256).toBe(sync);
  });

  it("different content produces a different sha256", async () => {
    const contentB: Record<string, unknown> = JSON.parse(JSON.stringify(baseContent));
    (contentB.metadata as Record<string, unknown>).title = "Different PDF Test ADR";
    const a = await renderPdf(makeInput());
    const b = await renderPdf(makeInput(contentB));
    expect(a.sha256).not.toBe(b.sha256);
  });
});

// ---------------------------------------------------------------------------
// renderPdf — unknown assertion keys dropped
// ---------------------------------------------------------------------------

describe("renderPdf — unknown assertion keys dropped", () => {
  it("does not include unknown keys in the PDF content sha256", async () => {
    const inputClean = makeInput();
    const inputWithUnknown: RenderInput = {
      ...makeInput(),
      content: {
        ...baseContent,
        bogusInventedKey: { fakeClaim: "FAKE_PDF_UNKNOWN_CLAIM" },
      },
    };
    const shaClean = computePdfContentSha256(inputClean);
    const shaUnknown = computePdfContentSha256(inputWithUnknown);
    // The sha256 should be the same because unknown keys are dropped
    // by buildPdfText before hashing.
    expect(shaClean).toBe(shaUnknown);
  });
});

// ---------------------------------------------------------------------------
// PdfNotAvailableError
// ---------------------------------------------------------------------------

describe("PdfNotAvailableError", () => {
  it("is an Error with a visible English message", () => {
    const err = new PdfNotAvailableError();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("PDF not built");
    expect(err.message).toContain("pdfkit");
    expect(err.name).toBe("PdfNotAvailableError");
  });

  it("states that fake bytes must not be produced", () => {
    const err = new PdfNotAvailableError();
    expect(err.message).toContain("Do not fake PDF bytes");
  });
});
