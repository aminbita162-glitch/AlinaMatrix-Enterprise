/**
 * Operator beachhead path — Phase B.
 *
 * renderBeachhead: one operator path from an approved M03 content model to
 * HTML and a build manifest, through the DeterministicFakeProvider.
 *
 * Directive Phase B:
 *   "One operator path from an approved M03 content model to HTML and
 *    manifest through the fake provider. Same inputs, same HTML sha256."
 *
 * The beachhead path:
 *   1. Validate the content model against M03ContentModelSchema (approved shape).
 *   2. Derive a deterministic input hash from the canonical content JSON and
 *      the pinned version inputs.
 *   3. Call DeterministicFakeProvider with the pinned hashes + input hash.
 *      The fake provider is deterministic (R07 — no live LLM), so the same
 *      inputs always produce the same output hash.
 *   4. Render the HTML from the approved content model (renderHtml).
 *   5. Build the manifest (buildManifest) pinning every version input + the
 *      fake-provider output hash as the contentHash.
 *   6. Return { html, htmlSha256, manifest, providerOutput }.
 *
 * Determinism:
 *   - The fake provider is a pure function of (promptSha256, schemaSha256,
 *     inputHash). Same inputs → same outputHash.
 *   - The HTML is a pure function of the content + watermark. Same inputs →
 *     same HTML string → same htmlSha256.
 *   - The manifest is a pure function of the input + HTML + buildId + buildTime.
 *   - No Date.now() or Math.random() is used inside this module.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { createHash } from "node:crypto";
import { renderHtml } from "./html.js";
import { buildManifest } from "./manifest.js";
import { buildWatermark } from "./watermark.js";
import {
  fakeProvider,
  type FakeProviderInput,
} from "@alinamatrix/domain";
import {
  M03ContentModelSchema,
  type M03ContentModel,
  type RenderInput,
  type Watermark,
  type RenderManifest,
  type RenderVersionPins,
} from "@alinamatrix/contracts";

// ============================================================
// Types
// ============================================================

/**
 * Pinned version inputs for the beachhead operator path.
 * These pin the fake-provider call and the manifest.
 */
export interface BeachheadVersionPins extends RenderVersionPins {
  /** SHA-256 of the pinned prompt template. */
  promptSha256:    string;
  /** SHA-256 of the pinned schema. */
  schemaSha256:    string;
  /** SHA-256 of the pinned policy. */
  policySha256:    string;
  /** Model identifier for the fake provider (e.g. "deterministic-fake-v1"). */
  modelId:         string;
}

/**
 * Input to the beachhead operator path.
 */
export interface BeachheadInput {
  /** The approved M03 content model. */
  content:         M03ContentModel;
  /** Watermark params (tenant, artifact version, build id, build time). */
  watermark:       Pick<Watermark, "tenantId" | "artifactVersion" | "buildId" | "buildTime">;
  /** Source version IDs referenced by this content model. */
  sourceVersionIds: string[];
  /** Pinned version inputs (prompt, schema, policy, model + version UUIDs). */
  pins:            BeachheadVersionPins;
  /** Renderer identifier (e.g. "html-static-v1"). */
  renderer:        string;
  /** Template identifier (e.g. "m03-adr-v1"). */
  template:        string;
}

/**
 * Result of the beachhead operator path.
 */
export interface BeachheadResult {
  /** Rendered HTML string (deterministic). */
  html:             string;
  /** SHA-256 of the HTML (deterministic). */
  htmlSha256:       string;
  /** Build manifest pinning every version input + the HTML sha256. */
  manifest:         RenderManifest;
  /** The fake-provider output hash (deterministic). */
  providerOutputHash: string;
  /** The fake-provider output JSON (deterministic). */
  providerOutputJson:  string;
}

// ============================================================
// Canonical content hash
// ============================================================

/**
 * Compute a deterministic SHA-256 of the canonical content JSON.
 * The content is JSON-stringified with sorted keys to ensure canonical
 * ordering regardless of insertion order.
 */
function computeContentHash(content: M03ContentModel): string {
  const canonical = JSON.stringify(sortKeys(content));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Recursively sort object keys for canonical JSON serialization.
 */
function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}

// ============================================================
// renderBeachhead — operator path
// ============================================================

/**
 * Execute the beachhead operator path:
 *   approved M03 content → DeterministicFakeProvider → HTML → manifest.
 *
 * Same inputs always produce the same htmlSha256, the same manifest, and
 * the same providerOutputHash. No live LLM is called (R07).
 *
 * @throws ZodError if the content model does not satisfy M03ContentModelSchema.
 * @throws ZodError if the watermark params are invalid.
 */
export function renderBeachhead(input: BeachheadInput): BeachheadResult {
  // 1. Validate the content model against the approved M03 schema.
  const validatedContent = M03ContentModelSchema.parse(input.content);

  // 2. Build the watermark (validates tenant, version, build id, time).
  const watermark = buildWatermark({
    tenantId:        input.watermark.tenantId,
    artifactVersion: input.watermark.artifactVersion,
    buildId:         input.watermark.buildId,
    buildTime:       input.watermark.buildTime,
  });

  // 3. Derive a deterministic content hash from the canonical content JSON.
  const contentHash = computeContentHash(validatedContent);

  // 4. Call the DeterministicFakeProvider with pinned hashes + input hash.
  //    The input hash combines the content hash and the pinned version UUIDs
  //    so the provider output is pinned to both the content and the versions.
  const versionCanonical = [
    input.pins.promptVersionId,
    input.pins.modelVersionId,
    input.pins.schemaVersionId,
    input.pins.policyVersionId,
  ].sort().join("|");
  const inputHash = createHash("sha256")
    .update(`${contentHash}|${versionCanonical}`, "utf8")
    .digest("hex");

  const fakeInput: FakeProviderInput = {
    promptSha256:  input.pins.promptSha256,
    schemaSha256:  input.pins.schemaSha256,
    inputHash,
    context:       `beachhead:tenant=${input.watermark.tenantId}`,
  };
  const providerOutput = fakeProvider.call(fakeInput);

  // 5. Build the RenderInput for the HTML renderer.
  const renderInput: RenderInput = {
    content:          validatedContent as unknown as Record<string, unknown>,
    watermark,
    sourceVersionIds: [...input.sourceVersionIds],
    versionPins: {
      promptVersionId: input.pins.promptVersionId,
      modelVersionId:  input.pins.modelVersionId,
      schemaVersionId: input.pins.schemaVersionId,
      policyVersionId: input.pins.policyVersionId,
    },
    renderer:    input.renderer,
    template:    input.template,
    // Use the provider output hash as the content hash pin so the manifest
    // records the fake-provider call that produced this build.
    contentHash: providerOutput.outputHash,
  };

  // 6. Render the HTML (deterministic from content + watermark).
  const html = renderHtml(renderInput);

  // 7. Build the manifest (pins every version input + html sha256).
  const { manifest, htmlSha256 } = buildManifest({
    input:     renderInput,
    html,
    buildId:   input.watermark.buildId,
    buildTime: input.watermark.buildTime,
  });

  return {
    html,
    htmlSha256,
    manifest,
    providerOutputHash: providerOutput.outputHash,
    providerOutputJson:  providerOutput.outputJson,
  };
}
