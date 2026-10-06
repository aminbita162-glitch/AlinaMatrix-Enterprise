/**
 * packages/renderer — public API
 *
 * Phase 8: HTML renderer (PDF, manifest, watermark added in subsequent commits).
 *
 * Status: Enterprise Candidate — Active Development
 */
export { renderHtml, renderWatermark } from "./html.js";
export { renderPdf, PdfNotAvailableError, computePdfContentSha256 } from "./pdf.js";
export type { RenderPdfResult } from "./pdf.js";
export { buildWatermark } from "./watermark.js";
export type { BuildWatermarkParams } from "./watermark.js";
export {
  buildManifest,
  computeHtmlSha256,
  renderPipeline,
} from "./manifest.js";
export type {
  BuildManifestParams,
  BuildManifestResult,
  RenderPipelineParams,
  RenderPipelineResult,
} from "./manifest.js";

// Phase B — operator beachhead path
export { renderBeachhead } from "./beachhead.js";
export type {
  BeachheadInput,
  BeachheadResult,
  BeachheadVersionPins,
} from "./beachhead.js";
