/**
 * Watermark builder — Phase 8.
 *
 * buildWatermark: construct a validated Watermark object from raw params.
 *
 * Directive Phase 8:
 *   "Watermark metadata: tenant, artifact version, build id, time."
 *
 * The watermark is embedded in the rendered HTML as <meta> tags by the
 * HTML renderer (renderWatermark). This module constructs the validated
 * watermark value that the render pipeline consumes.
 *
 * Determinism:
 *   - buildWatermark does not inject Date.now() or random values.
 *   - buildTime is supplied by the caller (deterministic for replay).
 *
 * Status: Enterprise Candidate — Active Development
 */
import { randomUUID } from "node:crypto";
import { WatermarkSchema } from "@alinamatrix/contracts";
import type { Watermark } from "@alinamatrix/contracts";

// ============================================================
// Params
// ============================================================

export interface BuildWatermarkParams {
  tenantId:        string;
  artifactVersion: number;
  /** UUID for the build. If omitted, a new UUID is generated. */
  buildId?:         string;
  /** ISO-8601 UTC timestamp. Supplied by the caller for determinism. */
  buildTime:        string;
}

// ============================================================
// buildWatermark
// ============================================================

/**
 * Construct a validated Watermark from raw params.
 *
 * If buildId is omitted, a new UUID is generated (non-deterministic —
 * callers that need replay determinism must pass an explicit buildId).
 *
 * @throws ZodError when params do not satisfy WatermarkSchema.
 */
export function buildWatermark(params: BuildWatermarkParams): Watermark {
  const wm: Watermark = {
    tenantId:        params.tenantId,
    artifactVersion: params.artifactVersion,
    buildId:         params.buildId ?? randomUUID(),
    buildTime:       params.buildTime,
    statusLine:      "Enterprise Candidate  -  Active Development",
  };
  // Validate against the schema — throws on invalid input.
  return WatermarkSchema.parse(wm);
}
