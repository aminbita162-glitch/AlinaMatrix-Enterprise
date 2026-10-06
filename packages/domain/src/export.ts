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
 * Check that the watermark is embedded in the HTML.
 *
 * The watermark is embedded as `<meta>` tags in the HTML `<head>` by the
 * renderer (Phase 8). We verify all four watermark fields are present as
 * values in the HTML string.
 */
export function isWatermarkIntact(
  html: string,
  watermark: ExportBundleInput["watermark"],
): boolean {
  const checks = [
    html.includes(watermark.tenantId),
    html.includes(String(watermark.artifactVersion)),
    html.includes(watermark.buildId),
    html.includes(watermark.buildTime),
  ];
  return checks.every(Boolean);
}
