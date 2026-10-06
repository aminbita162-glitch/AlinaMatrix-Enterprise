/**
 * Export bundle — Phase 9 (Unit 2: export bundle).
 *
 * Covers:
 *   - assertExportPermission — throws ExportPermissionError when allowed=false.
 *   - buildExportBundle — assembles an export bundle (HTML + watermark + sha256).
 *     Verifies the watermark is intact (present in the HTML) before returning.
 *     Throws WatermarkIntactError when the watermark is missing from the HTML.
 *
 * Directive Phase 9:
 *   "Export HTML only with permission. Audit it. Watermark intact."
 *
 * Status: Enterprise Candidate — Active Development
 */

// ============================================================
// Errors
// ============================================================

export class ExportPermissionError extends Error {
  constructor(deniedReason: string) {
    super(`Export denied: ${deniedReason}`);
    this.name = "ExportPermissionError";
  }
}

export class WatermarkIntactError extends Error {
  constructor() {
    super(
      "Export aborted: watermark is not intact (missing from rendered HTML). " +
      "The watermark metadata must be embedded in the HTML before export.",
    );
    this.name = "WatermarkIntactError";
  }
}

// ============================================================
// Export permission
// ============================================================

export interface ExportPermissionInput {
  allowed:       boolean;
  deniedReason?: string | null;
}

/**
 * Assert that export is permitted. Throws ExportPermissionError when not.
 *
 * Directive: "Export HTML only with permission."
 */
export function assertExportPermission(input: ExportPermissionInput): void {
  if (!input.allowed) {
    throw new ExportPermissionError(input.deniedReason ?? "permission not granted");
  }
}

// ============================================================
// Export bundle
// ============================================================

export interface ExportBundleInput {
  /** The rendered HTML to export. */
  html:             string;
  /** SHA-256 of the rendered HTML. */
  htmlSha256:       string;
  /** The watermark metadata that should be embedded in the HTML. */
  watermark: {
    tenantId:         string;
    artifactVersion:  number;
    buildId:          string;
    buildTime:        string;
  };
}

export interface ExportBundleResult {
  html:             string;
  htmlSha256:       string;
  watermarkIntact:  boolean;
  /** The watermark metadata, verified present in the HTML. */
  watermark:        ExportBundleInput["watermark"];
}

/**
 * Build an export bundle from a rendered artifact.
 *
 * Verifies the watermark is intact (present in the HTML) before returning.
 * Throws WatermarkIntactError when the watermark is missing.
 *
 * Directive: "Export HTML only with permission. Audit it. Watermark intact."
 *
 * @throws WatermarkIntactError when the watermark is not embedded in the HTML.
 */
export function buildExportBundle(input: ExportBundleInput): ExportBundleResult {
  const intact = isWatermarkIntact(input.html, input.watermark);
  if (!intact) {
    throw new WatermarkIntactError();
  }
  return {
    html:            input.html,
    htmlSha256:      input.htmlSha256,
    watermarkIntact: true,
    watermark:       input.watermark,
  };
}

/**
 * Check that the watermark is embedded in the HTML as the four renderer meta
 * tags (not merely as bare substrings).
 *
 * The renderer (Phase 8) emits the watermark as four <meta> tags in <head>:
 *   x-alinamatrix-tenant, x-alinamatrix-artifact-version,
 *   x-alinamatrix-build-id, x-alinamatrix-build-time.
 *
 * A bare substring check (does the HTML contain the tenant id?) is too weak:
 * the value could appear in body text without the meta tag being present, so
 * the watermark could be stripped from the head while its values survive
 * elsewhere. This check requires each field's value to appear in its own
 * named meta tag, proving the watermark block is intact.
 *
 * Directive Phase A: "Watermark intact requires the four renderer meta tags,
 * not a bare substring."
 */
export function isWatermarkIntact(
  html: string,
  watermark: ExportBundleInput["watermark"],
): boolean {
  const tagPairs: Array<[string, string]> = [
    [`x-alinamatrix-tenant`,            watermark.tenantId],
    [`x-alinamatrix-artifact-version`,  String(watermark.artifactVersion)],
    [`x-alinamatrix-build-id`,          watermark.buildId],
    [`x-alinamatrix-build-time`,        watermark.buildTime],
  ];

  for (const [name, value] of tagPairs) {
    // Match the meta tag by name and require the expected value as its
    // content attribute. Allow either single or double quotes around the
    // content value (the renderer emits double quotes; be tolerant on read).
    const re = new RegExp(
      `<meta\\s+name=["']${escapeRegExp(name)}["']\\s+content=["']${escapeRegExp(value)}["']`,
    );
    if (!re.test(html)) return false;
  }
  return true;
}

/** Escape a string for literal inclusion in a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
