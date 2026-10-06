/**
 * Schema-driven M03 template — Phase E (Unit 1: schema-driven M03 template).
 *
 * Covers:
 *   - resolveTemplateKeys — intersect the template's declared section keys
 *     with the pinned M03 content model schema keys. Only keys in both the
 *     template AND the schema are rendered. Unknown keys (not in the template)
 *     are dropped.
 *   - assertTemplateKeyKnown — throw UnknownTemplateKeyError when a key in the
 *     content is not declared by the template (unknown-key rejection).
 *   - M03_DEFAULT_TEMPLATE — the default M03 ADR template that renders every
 *     known section of the M03 content model in the canonical order.
 *
 * Directive Phase E:
 *   "Schema-driven M03 template: render only keys declared by the pinned
 *    schema."
 *
 * Determinism:
 *   - resolveTemplateKeys is a pure function of (template, schema keys).
 *   - No Date.now() or Math.random() is used.
 *
 * Status: Enterprise Candidate — Active Development
 */
import type { M03Template } from "@alinamatrix/contracts";

// ============================================================
// Errors
// ============================================================

export class UnknownTemplateKeyError extends Error {
  constructor(key: string, templateId: string) {
    super(
      `Unknown key "${key}" is not declared by template "${templateId}". ` +
      "Only keys declared by the pinned schema are rendered.",
    );
    this.name = "UnknownTemplateKeyError";
  }
}

export class TemplateInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateInputError";
  }
}

// ============================================================
// M03 content model — known top-level keys (pinned schema)
// ============================================================

/**
 * The pinned M03 content model top-level keys.
 *
 * These are the keys declared by M03ContentModelSchema. A template key that
 * is not in this set is an unknown key and is dropped (not rendered).
 */
export const M03_SCHEMA_KEYS: readonly string[] = [
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

const M03_SCHEMA_KEY_SET: ReadonlySet<string> = new Set<string>(M03_SCHEMA_KEYS);

// ============================================================
// Default M03 ADR template
// ============================================================

/**
 * The default M03 ADR template — renders every known M03 section in the
 * canonical order. Used by the beachhead operator path.
 */
export const M03_DEFAULT_TEMPLATE: M03Template = {
  id:      "m03-adr-v1",
  version: "1.0.0",
  sections: M03_SCHEMA_KEYS.map((key) => ({
    key,
    label: key,
  })),
};

// ============================================================
// resolveTemplateKeys
// ============================================================

/**
 * Resolve the render keys from a template and the pinned M03 schema keys.
 *
 * Only keys that appear in BOTH the template's declared sections AND the
 * pinned M03 schema keys are returned, in the template's declared order.
 * A key declared by the template but not in the pinned schema is dropped
 * (it is not a known M03 key).
 *
 * Directive: "Render only keys declared by the pinned schema."
 *
 * @param template       The M03 template (declared sections, in order).
 * @param schemaKeys     The pinned M03 content model keys (defaults to
 *                       M03_SCHEMA_KEYS).
 * @returns              The ordered list of keys to render (intersection).
 */
export function resolveTemplateKeys(
  template: M03Template,
  schemaKeys: readonly string[] = M03_SCHEMA_KEYS,
): string[] {
  const schemaSet = new Set<string>(schemaKeys);
  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const section of template.sections) {
    if (!schemaSet.has(section.key)) continue;
    if (seen.has(section.key)) continue;
    seen.add(section.key);
    resolved.push(section.key);
  }
  return resolved;
}

// ============================================================
// assertTemplateKeyKnown — unknown-key rejection
// ============================================================

/**
 * Assert that a key in the content is declared by the template.
 *
 * Throws UnknownTemplateKeyError when the key is not declared by the
 * template's sections. A key not declared by the template is an unknown key
 * and is dropped from the rendered output.
 *
 * Directive: "Tests for unknown key dropped."
 *
 * @param contentKeys    All keys present in the content object.
 * @param template       The M03 template.
 * @throws UnknownTemplateKeyError for the first key not declared by the template.
 */
export function assertTemplateKeyKnown(
  contentKeys: string[],
  template: M03Template,
): void {
  const declared = new Set(template.sections.map((s) => s.key));
  for (const key of contentKeys) {
    if (!declared.has(key)) {
      throw new UnknownTemplateKeyError(key, template.id);
    }
  }
}

// ============================================================
// filterContentByTemplate — drop unknown keys from content
// ============================================================

/**
 * Filter a content object to only the keys declared by the template (and the
 * pinned schema). Unknown keys are dropped.
 *
 * Returns a new object containing only the resolved template keys present in
 * the content. Does not mutate the input.
 *
 * Directive: "Render only keys declared by the pinned schema."
 */
export function filterContentByTemplate(
  content: Record<string, unknown>,
  template: M03Template,
  schemaKeys: readonly string[] = M03_SCHEMA_KEYS,
): Record<string, unknown> {
  const resolvedKeys = new Set(resolveTemplateKeys(template, schemaKeys));
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content)) {
    if (resolvedKeys.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

// ============================================================
// isKeyRenderable — check a single key
// ============================================================

/**
 * Return true when a key is renderable: it must be in both the template and
 * the pinned M03 schema keys.
 */
export function isKeyRenderable(
  key: string,
  template: M03Template,
  schemaKeys: readonly string[] = M03_SCHEMA_KEYS,
): boolean {
  const schemaSet = new Set<string>(schemaKeys);
  if (!schemaSet.has(key)) return false;
  return template.sections.some((s) => s.key === key);
}

// Re-export for convenience
void M03_SCHEMA_KEY_SET;
