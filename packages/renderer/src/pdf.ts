/**
 * PDF renderer — Phase 8.
 *
 * Directive Phase 8:
 *   "PDF only if a local pinned renderer works offline without a new network
 *    install. Else record 'PDF not built' as an open limitation. Do not fake
 *    PDF bytes."
 *
 * Workspace inventory:
 *   - pdf-parse@2.4.5  — PDF *reader* (text extraction), not a renderer.
 *   - pdfjs-dist@5.4  — PDF *reader* (Mozilla PDF.js viewer), not a renderer.
 *   - No puppeteer, playwright, wkhtmltopdf, weasyprint, or html-pdf present.
 *   - No system PDF generation tool (wkhtmltopdf, pandoc, weasyprint) installed.
 *
 * Conclusion: no local pinned offline PDF renderer is available. The status
 * is "not_built" with a visible English reason. No fake bytes are ever emitted.
 *
 * Status: Enterprise Candidate — Active Development
 */

/**
 * Error thrown when a PDF render is attempted but no local pinned offline
 * renderer is available. Callers should catch this and record the limitation.
 */
export class PdfNotAvailableError extends Error {
  constructor() {
    super(
      "PDF not built: no local pinned offline PDF renderer is available. " +
      "Install puppeteer, playwright, or wkhtmltopdf and pin it to enable " +
      "offline PDF generation. Do not fake PDF bytes.",
    );
    this.name = "PdfNotAvailableError";
  }
}

/**
 * Result of a PDF render attempt.
 *
 * When status="not_built", bytes and sha256 are absent and reason is present.
 * When status="built", bytes and sha256 are present and reason is absent.
 */
export interface RenderPdfResult {
  status: "built" | "not_built";
  bytes?:    Uint8Array;
  sha256?:   string;
  reason?:   string;
}

/**
 * Attempt to render the approved content model as a PDF.
 *
 * No local pinned offline PDF renderer is available in this workspace.
 * This function returns a "not_built" result with a visible English reason.
 * It does not emit fake PDF bytes.
 *
 * @returns RenderPdfResult with status="not_built".
 */
export function renderPdf(): RenderPdfResult {
  return {
    status: "not_built",
    reason:
      "PDF not built: no local pinned offline PDF renderer is available " +
      "in this workspace. pdf-parse and pdfjs-dist are PDF readers, not " +
      "renderers. Install a pinned offline renderer to enable PDF output.",
  };
}
