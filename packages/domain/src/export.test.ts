/**
 * Domain tests for Phase 9 Unit 2: export bundle.
 *
 * All tests are pure (no I/O, no database).
 *
 * Covers:
 *   - assertExportPermission: throws ExportPermissionError when not allowed.
 *   - buildExportBundle: returns a bundle when watermark is intact.
 *   - buildExportBundle: throws WatermarkIntactError when watermark missing.
 *   - isWatermarkIntact: detects watermark presence/absence in HTML.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import {
  assertExportPermission,
  ExportPermissionError,
  buildExportBundle,
  WatermarkIntactError,
  isWatermarkIntact,
} from "./export.js";

// ============================================================
// Fixtures
// ============================================================

const UUID = "aaaaaaaa-0000-4000-8000-000000000001";
const BUILD_ID = "bbbbbbbb-0000-4000-8000-000000000002";

const WATERMARK = {
  tenantId:        UUID,
  artifactVersion: 1,
  buildId:         BUILD_ID,
  buildTime:       "2026-10-06T12:00:00.000Z",
};

const HTML_WITH_WATERMARK = `<!DOCTYPE html>
<html>
<head>
  <meta name="x-alinamatrix-tenant" content="${UUID}">
  <meta name="x-alinamatrix-artifact-version" content="1">
  <meta name="x-alinamatrix-build-id" content="${BUILD_ID}">
  <meta name="x-alinamatrix-build-time" content="2026-10-06T12:00:00.000Z">
  <title>ADR-0001</title>
</head>
<body><h1>Decision</h1></body>
</html>`;

const HTML_WITHOUT_WATERMARK = `<!DOCTYPE html>
<html><head><title>ADR-0001</title></head>
<body><h1>Decision</h1></body></html>`;

const HTML_PARTIAL_WATERMARK = `<!DOCTYPE html>
<html>
<head>
  <meta name="x-alinamatrix-tenant" content="${UUID}">
  <meta name="x-alinamatrix-artifact-version" content="1">
</head>
<body></body>
</html>`;

const SHA256 = "a".repeat(64);

// ============================================================
// assertExportPermission
// ============================================================

describe("assertExportPermission", () => {
  it("does not throw when allowed is true", () => {
    expect(() => assertExportPermission({ allowed: true })).not.toThrow();
  });

  it("throws ExportPermissionError when allowed is false", () => {
    expect(() => assertExportPermission({ allowed: false, deniedReason: "no export role" }))
      .toThrow(ExportPermissionError);
  });

  it("uses a default denied reason when none provided", () => {
    try {
      assertExportPermission({ allowed: false });
    } catch (err) {
      expect(err).toBeInstanceOf(ExportPermissionError);
      expect((err as ExportPermissionError).message).toContain("permission not granted");
    }
  });

  it("includes the denied reason in the error message", () => {
    try {
      assertExportPermission({ allowed: false, deniedReason: "tenant export disabled" });
    } catch (err) {
      expect(err).toBeInstanceOf(ExportPermissionError);
      expect((err as ExportPermissionError).message).toContain("tenant export disabled");
    }
  });
});

// ============================================================
// isWatermarkIntact
// ============================================================

describe("isWatermarkIntact", () => {
  it("returns true when all watermark fields are in the HTML", () => {
    expect(isWatermarkIntact(HTML_WITH_WATERMARK, WATERMARK)).toBe(true);
  });

  it("returns false when the watermark is missing from the HTML", () => {
    expect(isWatermarkIntact(HTML_WITHOUT_WATERMARK, WATERMARK)).toBe(false);
  });

  it("returns false when only some watermark fields are present", () => {
    expect(isWatermarkIntact(HTML_PARTIAL_WATERMARK, WATERMARK)).toBe(false);
  });

  it("returns false for empty HTML", () => {
    expect(isWatermarkIntact("", WATERMARK)).toBe(false);
  });
});

// ============================================================
// buildExportBundle
// ============================================================

describe("buildExportBundle", () => {
  it("returns a bundle with watermarkIntact=true when the watermark is present", () => {
    const bundle = buildExportBundle({
      html:       HTML_WITH_WATERMARK,
      htmlSha256: SHA256,
      watermark:  WATERMARK,
    });
    expect(bundle.watermarkIntact).toBe(true);
    expect(bundle.html).toBe(HTML_WITH_WATERMARK);
    expect(bundle.htmlSha256).toBe(SHA256);
    expect(bundle.watermark).toEqual(WATERMARK);
  });

  it("throws WatermarkIntactError when the watermark is missing", () => {
    expect(() => buildExportBundle({
      html:       HTML_WITHOUT_WATERMARK,
      htmlSha256: SHA256,
      watermark:  WATERMARK,
    })).toThrow(WatermarkIntactError);
  });

  it("throws WatermarkIntactError when the watermark is partial", () => {
    expect(() => buildExportBundle({
      html:       HTML_PARTIAL_WATERMARK,
      htmlSha256: SHA256,
      watermark:  WATERMARK,
    })).toThrow(WatermarkIntactError);
  });

  it("throws WatermarkIntactError for empty HTML", () => {
    expect(() => buildExportBundle({
      html:       "",
      htmlSha256: SHA256,
      watermark:  WATERMARK,
    })).toThrow(WatermarkIntactError);
  });

  it("does not throw when all four watermark values are present as meta tags", () => {
    expect(() => buildExportBundle({
      html:       HTML_WITH_WATERMARK,
      htmlSha256: SHA256,
      watermark:  WATERMARK,
    })).not.toThrow();
  });
});
