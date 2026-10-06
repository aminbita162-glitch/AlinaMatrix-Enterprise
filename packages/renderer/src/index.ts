/**
 * packages/renderer — public API
 *
 * Phase 8: HTML renderer (PDF, manifest, watermark added in subsequent commits).
 *
 * Status: Enterprise Candidate — Active Development
 */
export { renderHtml, renderWatermark } from "./html.js";
export { renderPdf, PdfNotAvailableError } from "./pdf.js";
export type { RenderPdfResult } from "./pdf.js";
