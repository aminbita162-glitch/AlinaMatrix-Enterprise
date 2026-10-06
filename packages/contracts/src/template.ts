/**
 * M03 template contracts — Phase E (Unit 1: schema-driven M03 template).
 *
 * Zod schemas for the schema-driven M03 template:
 *   - M03TemplateSchema        — a named template that declares the section
 *                                keys it renders. The template is validated
 *                                against the pinned M03 content model schema:
 *                                only keys declared by the template AND present
 *                                in the schema are rendered. Unknown keys are
 *                                dropped.
 *   - M03TemplateSectionSchema  — a single declared section (key + label).
 *
 * Directive Phase E:
 *   "Schema-driven M03 template: render only keys declared by the pinned
 *    schema."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

// ============================================================
// Primitives
// ============================================================

const ShortString = z.string().min(1).max(512);

// ============================================================
// Template section
// ============================================================

/**
 * A single declared section in an M03 template.
 *
 * The `key` must match a top-level key in the M03 content model schema.
 * The `label` is the human-readable heading used in the rendered output.
 */
export const M03TemplateSectionSchema = z.object({
  /** The M03 content model key this section renders. */
  key:   ShortString,
  /** Human-readable label for the rendered section. */
  label: ShortString,
});
export type M03TemplateSection = z.infer<typeof M03TemplateSectionSchema>;

// ============================================================
// M03 template
// ============================================================

/**
 * A schema-driven M03 template.
 *
 * The template declares the section keys it renders. At render time, the
 * renderer intersects the declared keys with the pinned M03 content model
 * schema keys: only keys that appear in BOTH the template AND the schema are
 * rendered. Any key in the content that is not declared by the template is an
 * "unknown key" and is dropped.
 *
 * Directive: "Render only keys declared by the pinned schema."
 */
export const M03TemplateSchema = z.object({
  /** Template identifier (e.g. "m03-adr-v1"). */
  id:        ShortString,
  /** Template version (semantic, e.g. "1.0.0"). */
  version:   ShortString,
  /** Declared sections, in render order. */
  sections:  z.array(M03TemplateSectionSchema).min(1),
});
export type M03Template = z.infer<typeof M03TemplateSchema>;
