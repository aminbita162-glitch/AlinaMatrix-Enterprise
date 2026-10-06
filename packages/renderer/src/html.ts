/**
 * HTML renderer — Phase 8.
 *
 * renderHtml: deterministic HTML string from the approved M03 content model.
 *
 * Rules (from DIRECTIV.txt Phase 8):
 *   - "Render HTML only from the approved content model."
 *   - "Drop unknown assertion keys."  Only known M03 sections are rendered;
 *     any extra keys in the content object are silently ignored (not emitted).
 *   - "Include limitations, assumptions, evidence map, approvals."
 *
 * Determinism:
 *   - Section order is fixed (the M03 content model key order).
 *   - Array items are rendered in their input order.
 *   - No timestamps, random numbers, or environment values are injected
 *     beyond the watermark supplied by the caller.
 *   - HTML is built from string concatenation of escaped text; the output
 *     is identical for identical inputs.
 *
 * Status: Enterprise Candidate — Active Development
 */
import type { Watermark, RenderInput } from "@alinamatrix/contracts";

// ============================================================
// Known M03 content model keys (render oracle)
// ============================================================

/**
 * The canonical section order. Only these keys are rendered; any other
 * key in the content object is an "unknown assertion key" and is dropped.
 */
const M03_SECTION_ORDER = [
  "metadata",
  "context",
  "decision",
  "status",
  "drivers",
  "options",
  "outcome",
  "consequences",
  "evidenceMap",
  "claimAtoms",
  "assumptions",
  "negativeEvidence",
  "terminology",
  "risks",
  "openQuestions",
  "review",
  "approval",
  "limitations",
  "releaseMetadata",
] as const;

/**
 * Set of known section keys for O(1) lookup.
 * An assertion key not in this set is an unknown key and is dropped.
 */
const KNOWN_SECTION_KEYS: ReadonlySet<string> = new Set<string>(M03_SECTION_ORDER);

// ============================================================
// HTML escaping
// ============================================================

/**
 * Escape a string for safe inclusion in HTML text content.
 * Escapes: & < > " '
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape a string for safe inclusion inside an HTML attribute value.
 */
function escapeAttr(text: string): string {
  return escapeHtml(text);
}

// ============================================================
// Section renderers
// ============================================================

/**
 * Render a key-value pair as a <dt>/<dd> definition list entry.
 */
function renderKeyValue(key: string, value: unknown): string {
  const val = typeof value === "string"
    ? escapeHtml(value)
    : escapeHtml(JSON.stringify(value));
  return `    <dt>${escapeHtml(key)}</dt>\n    <dd>${val}</dd>\n`;
}

/**
 * Render an array of objects as a list of definition lists.
 */
function renderObjectArray(items: unknown[], label: string): string {
  if (items.length === 0) return "";
  const parts: string[] = [`  <section class="${escapeAttr(label)}">\n`];
  for (const item of items) {
    if (item === null || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    parts.push(`    <div class="item">\n`);
    for (const [k, v] of Object.entries(obj)) {
      parts.push(renderKeyValue(k, v));
    }
    parts.push(`    </div>\n`);
  }
  parts.push(`  </section>\n`);
  return parts.join("");
}

/**
 * Render a flat object (key -> primitive) as a <dl>.
 */
function renderFlatObject(obj: Record<string, unknown>, label: string): string {
  const keys = Object.keys(obj);
  if (keys.length === 0) return "";
  const parts: string[] = [`  <section class="${escapeAttr(label)}">\n    <dl>\n`];
  for (const [k, v] of Object.entries(obj)) {
    parts.push(renderKeyValue(k, v));
  }
  parts.push(`    </dl>\n  </section>\n`);
  return parts.join("");
}

// ============================================================
// Watermark rendering
// ============================================================

/**
 * Render the watermark as an HTML <meta> block.
 *
 * Directive: "Watermark metadata: tenant, artifact version, build id, time."
 */
export function renderWatermark(wm: Watermark): string {
  const lines: string[] = [
    `  <meta name="x-alinamatrix-tenant" content="${escapeAttr(wm.tenantId)}" />`,
    `  <meta name="x-alinamatrix-artifact-version" content="${escapeAttr(String(wm.artifactVersion))}" />`,
    `  <meta name="x-alinamatrix-build-id" content="${escapeAttr(wm.buildId)}" />`,
    `  <meta name="x-alinamatrix-build-time" content="${escapeAttr(wm.buildTime)}" />`,
    `  <meta name="x-alinamatrix-status" content="${escapeAttr(wm.statusLine)}" />`,
  ];
  return lines.join("\n") + "\n";
}

// ============================================================
// Section rendering dispatch
// ============================================================

/**
 * Render a single known section. Unknown keys are never called.
 */
function renderSection(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";

  switch (key) {
    case "metadata":
    case "context":
    case "decision":
    case "status":
    case "outcome":
    case "releaseMetadata": {
      if (typeof value !== "object" || value === null) return "";
      return renderFlatObject(value as Record<string, unknown>, key);
    }

    case "drivers":
    case "options":
    case "consequences":
    case "evidenceMap":
    case "claimAtoms":
    case "assumptions":
    case "negativeEvidence":
    case "terminology":
    case "risks":
    case "openQuestions":
    case "review":
    case "approval":
    case "limitations": {
      if (!Array.isArray(value)) return "";
      return renderObjectArray(value, key);
    }

    default:
      // Exhaustiveness: no other key is a known section.
      return "";
  }
}

// ============================================================
// Main entry: renderHtml
// ============================================================

/**
 * Render the approved M03 content model as a deterministic HTML document.
 *
 * Invariants:
 *   - Only known M03 section keys are rendered; unknown assertion keys
 *     are dropped (never emitted to HTML).
 *   - The section order is fixed (M03_SECTION_ORDER).
 *   - The watermark is embedded as <meta> tags in <head>.
 *   - Limitations, assumptions, evidence map, and approvals are included
 *     because they are known sections rendered in order.
 *   - The output is a complete, valid HTML5 document.
 *
 * @param input  The render input (validated upstream by RenderInputSchema).
 * @returns       Deterministic HTML string.
 */
export function renderHtml(input: RenderInput): string {
  const { content, watermark } = input;

  const parts: string[] = [];
  parts.push("<!DOCTYPE html>\n");
  parts.push("<html lang=\"en\">\n");
  parts.push("<head>\n");
  parts.push("  <meta charset=\"utf-8\" />\n");
  parts.push("  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n");
  parts.push(`  <title>Enterprise Candidate Artifact</title>\n`);
  parts.push(renderWatermark(watermark));
  parts.push("</head>\n");
  parts.push("<body>\n");
  parts.push("  <main class=\"m03-artifact\">\n");

  // Render sections in fixed order. Unknown keys are dropped.
  for (const sectionKey of M03_SECTION_ORDER) {
    if (!KNOWN_SECTION_KEYS.has(sectionKey)) continue;
    const sectionValue = (content as Record<string, unknown>)[sectionKey];
    if (sectionValue === undefined || sectionValue === null) continue;
    parts.push(renderSection(sectionKey, sectionValue));
  }

  parts.push("  </main>\n");
  parts.push("</body>\n");
  parts.push("</html>\n");

  return parts.join("");
}
