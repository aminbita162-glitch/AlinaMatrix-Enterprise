/**
 * Build manifest — Phase 8.
 *
 * buildManifest: assemble the render manifest from the render input and
 * the rendered HTML. The manifest pins every version input and the HTML
 * checksum, so a replay with identical inputs produces an identical manifest.
 *
 * Directive Phase 8:
 *   "Manifest: content hash, source version ids, prompt, model, schema,
 *    policy, renderer, template, build id, time, sha256 of HTML."
 *
 * Determinism:
 *   - buildId is supplied by the caller (deterministic for replay).
 *   - buildTime is supplied by the caller (deterministic for replay).
 *   - htmlSha256 is computed from the HTML string (deterministic).
 *   - No Date.now() or Math.random() is used inside this module.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { createHash } from "node:crypto";
import type {
  RenderInput,
  RenderManifest,
  RenderResult,
} from "@alinamatrix/contracts";

// ============================================================
// SHA-256 of HTML
// ============================================================

/**
 * Compute the SHA-256 hex digest of an HTML string.
 * Deterministic: same string -> same hex digest.
 */
export function computeHtmlSha256(html: string): string {
  return createHash("sha256").update(html, "utf8").digest("hex");
}

// ============================================================
// Build manifest params
// ============================================================

export interface BuildManifestParams {
  /** The render input (content, watermark, version pins, source versions). */
  input: RenderInput;
  /** The rendered HTML string. */
  html: string;
  /**
   * Build ID (UUID). Supplied by the caller for determinism.
   * For replay, the same build ID must be re-used.
   */
  buildId: string;
  /**
   * Build time (ISO-8601 UTC). Supplied by the caller for determinism.
   * For replay, the same build time must be re-used.
   */
  buildTime: string;
}

// ============================================================
// Build manifest result
// ============================================================

export interface BuildManifestResult {
  manifest: RenderManifest;
  /** SHA-256 of the HTML (also in the manifest). */
  htmlSha256: string;
  /** The full render result: HTML, its hash, and the manifest. */
  result: RenderResult;
}

// ============================================================
// buildManifest
// ============================================================

/**
 * Assemble the render manifest from the render input and rendered HTML.
 *
 * The manifest includes:
 *   - contentHash (from input)
 *   - sourceVersionIds (from input)
 *   - promptVersionId, modelVersionId, schemaVersionId, policyVersionId
 *     (from input.versionPins)
 *   - renderer (from input)
 *   - template (from input)
 *   - buildId (from params)
 *   - buildTime (from params)
 *   - htmlSha256 (computed from the HTML string)
 *
 * @returns The manifest, the HTML sha256, and the full RenderResult.
 */
export function buildManifest(params: BuildManifestParams): BuildManifestResult {
  const { input, html, buildId, buildTime } = params;

  const htmlSha256 = computeHtmlSha256(html);

  const manifest: RenderManifest = {
    contentHash:        input.contentHash,
    sourceVersionIds:   [...input.sourceVersionIds],
    promptVersionId:    input.versionPins.promptVersionId,
    modelVersionId:     input.versionPins.modelVersionId,
    schemaVersionId:    input.versionPins.schemaVersionId,
    policyVersionId:   input.versionPins.policyVersionId,
    renderer:           input.renderer,
    template:           input.template,
    buildId:            buildId,
    buildTime:          buildTime,
    htmlSha256:         htmlSha256,
  };

  const result: RenderResult = {
    html,
    htmlSha256,
    manifest,
  };

  return { manifest, htmlSha256, result };
}

// ============================================================
// Render pipeline (HTML + manifest in one call)
// ============================================================

import { renderHtml } from "./html.js";

export interface RenderPipelineParams {
  input: RenderInput;
  buildId: string;
  buildTime: string;
}

export interface RenderPipelineResult {
  html: string;
  htmlSha256: string;
  manifest: RenderManifest;
}

/**
 * Run the full render pipeline: render HTML, compute sha256, build manifest.
 *
 * Deterministic for identical inputs (including buildId and buildTime).
 */
export function renderPipeline(params: RenderPipelineParams): RenderPipelineResult {
  const { input, buildId, buildTime } = params;
  const html = renderHtml(input);
  const { manifest, htmlSha256 } = buildManifest({ input, html, buildId, buildTime });
  return { html, htmlSha256, manifest };
}
