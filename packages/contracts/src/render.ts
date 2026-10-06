/**
 * Render contracts — Phase 8.
 *
 * Zod schemas for the render pipeline:
 *   - WatermarkSchema         — tenant, artifact version, build id, time.
 *   - RenderInputSchema       — approved M03 content model + version pins +
 *                                watermark params + source version ids.
 *   - RenderManifestSchema    — content hash, source version ids, version
 *                                pins (prompt, model, schema, policy),
 *                                renderer, template, build id, time,
 *                                sha256 of HTML.
 *   - RenderResultSchema      — html, sha256 of html, manifest.
 *
 * Directive Phase 8:
 *   - "Manifest: content hash, source version ids, prompt, model, schema,
 *      policy, renderer, template, build id, time, sha256 of HTML."
 *   - "Watermark metadata: tenant, artifact version, build id, time."
 *   - "Replay test: same inputs -> same HTML sha256."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

// ============================================================
// Primitives
// ============================================================

const UuidString      = z.string().uuid();
const Sha256Hex       = z.string().length(64).regex(/^[0-9a-f]{64}$/);
/** ISO-8601 UTC datetime. */
const IsoUtc          = z.string().datetime();
const NonEmptyString  = z.string().min(1).max(4096);
const ShortString     = z.string().min(1).max(512);

// ============================================================
// Watermark
// ============================================================

/**
 * Watermark metadata embedded in the rendered HTML.
 *
 * Directive: "Watermark metadata: tenant, artifact version, build id, time."
 */
export const WatermarkSchema = z.object({
  tenantId:         UuidString,
  artifactVersion:  z.number().int().positive(),
  buildId:          UuidString,
  /** ISO-8601 UTC timestamp the build was produced. */
  buildTime:        IsoUtc,
  /** Exact status line per H02. */
  statusLine:       z.literal("Enterprise Candidate  -  Active Development"),
});
export type Watermark = z.infer<typeof WatermarkSchema>;

// ============================================================
// Version pins (prompt, model, schema, policy)
// ============================================================

/**
 * Pinned version identifiers required by the manifest.
 *
 * Directive: "Manifest: ... prompt, model, schema, policy, ...".
 */
export const RenderVersionPinsSchema = z.object({
  promptVersionId:   UuidString,
  modelVersionId:    UuidString,
  schemaVersionId:   UuidString,
  policyVersionId:   UuidString,
});
export type RenderVersionPins = z.infer<typeof RenderVersionPinsSchema>;

// ============================================================
// Render input
// ============================================================

/**
 * Input to the render pipeline.
 *
 * Contains the approved M03 content model, the watermark params, the
 * source version ids referenced, and the pinned version identifiers.
 *
 * Directive: "Render HTML only from the approved content model."
 */
export const RenderInputSchema = z.object({
  /** The approved M03 content model (validated upstream). */
  content:           z.record(z.string(), z.unknown()),
  watermark:          WatermarkSchema,
  sourceVersionIds:   z.array(UuidString),
  versionPins:        RenderVersionPinsSchema,
  /** Renderer identifier (e.g. "html-static-v1"). */
  renderer:           ShortString,
  /** Template identifier (e.g. "m03-adr-v1"). */
  template:           ShortString,
  /** SHA-256 of the approved content JSON (content hash). */
  contentHash:        Sha256Hex,
});
export type RenderInput = z.infer<typeof RenderInputSchema>;

// ============================================================
// Render manifest
// ============================================================

/**
 * Build manifest pinned to every version input and the rendered HTML.
 *
 * Directive Phase 8:
 *   "Manifest: content hash, source version ids, prompt, model, schema,
 *    policy, renderer, template, build id, time, sha256 of HTML."
 */
export const RenderManifestSchema = z.object({
  contentHash:        Sha256Hex,
  sourceVersionIds:   z.array(UuidString),
  promptVersionId:    UuidString,
  modelVersionId:     UuidString,
  schemaVersionId:    UuidString,
  policyVersionId:    UuidString,
  renderer:           ShortString,
  template:           ShortString,
  buildId:            UuidString,
  buildTime:          IsoUtc,
  htmlSha256:         Sha256Hex,
});
export type RenderManifest = z.infer<typeof RenderManifestSchema>;

// ============================================================
// Render result
// ============================================================

/**
 * Result of a render pass.
 *
 * The HTML string, its SHA-256, and the assembled manifest.
 */
export const RenderResultSchema = z.object({
  html:               z.string().min(1),
  htmlSha256:         Sha256Hex,
  manifest:           RenderManifestSchema,
});
export type RenderResult = z.infer<typeof RenderResultSchema>;

// ============================================================
// PDF status (honest — not built)
// ============================================================

/**
 * PDF render outcome.
 *
 * Directive: "PDF only if a local pinned renderer works offline without a
 * new network install. Else record 'PDF not built' as an open limitation.
 * Do not fake PDF bytes."
 *
 * No local pinned offline PDF renderer is available in this workspace
 * (pdf-parse and pdfjs-dist are PDF *readers*; no puppeteer, playwright,
 * wkhtmltopdf, or weasyprint). The status is therefore "not_built" with
 * a visible English reason. No fake bytes are ever emitted.
 */
export const PdfStatusSchema = z.enum(["built", "not_built"]);
export type PdfStatus = z.infer<typeof PdfStatusSchema>;

export const PdfResultSchema = z.object({
  status:     PdfStatusSchema,
  /** Present only when status="built". Never faked. */
  bytes:      z.instanceof(Uint8Array).optional(),
  sha256:     Sha256Hex.optional(),
  /** English reason when status="not_built". */
  reason:     NonEmptyString.optional(),
});
export type PdfResult = z.infer<typeof PdfResultSchema>;
