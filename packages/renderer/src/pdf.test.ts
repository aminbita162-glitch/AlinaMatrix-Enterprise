/**
 * Unit tests for packages/renderer/src/pdf.ts — PDF renderer (not built).
 *
 * Covers:
 *   - renderPdf returns status="not_built" (no local pinned offline renderer).
 *   - No fake bytes are ever emitted.
 *   - A visible English reason is present.
 *   - PdfNotAvailableError is thrown when a caller requires a built PDF.
 *
 * Directive: "Do not fake PDF bytes."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { renderPdf, PdfNotAvailableError } from "./pdf.js";

describe("renderPdf", () => {
  it("returns status='not_built'", () => {
    const result = renderPdf();
    expect(result.status).toBe("not_built");
  });

  it("does not emit fake bytes", () => {
    const result = renderPdf();
    expect(result.bytes).toBeUndefined();
    expect(result.sha256).toBeUndefined();
  });

  it("includes a visible English reason", () => {
    const result = renderPdf();
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain("PDF not built");
    expect(result.reason).toContain("no local pinned offline PDF renderer");
  });
});

describe("PdfNotAvailableError", () => {
  it("is an Error with a visible English message", () => {
    const err = new PdfNotAvailableError();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("PDF not built");
    expect(err.message).toContain("no local pinned offline PDF renderer");
    expect(err.name).toBe("PdfNotAvailableError");
  });

  it("states that fake bytes must not be produced", () => {
    const err = new PdfNotAvailableError();
    expect(err.message).toContain("Do not fake PDF bytes");
  });
});
