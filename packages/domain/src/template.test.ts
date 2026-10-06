/**
 * Unit tests for packages/domain/src/template.ts — schema-driven M03 template
 * (Phase E Unit 1).
 *
 * Covers:
 *   - M03_DEFAULT_TEMPLATE: declares all known M03 sections in canonical order.
 *   - resolveTemplateKeys: intersects template keys with pinned schema keys;
 *     unknown keys (not in the schema) are dropped; order follows the template.
 *   - resolveTemplateKeys: deduplicates repeated keys.
 *   - assertTemplateKeyKnown: throws UnknownTemplateKeyError for keys not
 *     declared by the template (unknown-key rejection).
 *   - filterContentByTemplate: drops unknown keys from the content object.
 *   - isKeyRenderable: returns true only for keys in both template and schema.
 *
 * Directive Phase E:
 *   "Schema-driven M03 template: render only keys declared by the pinned
 *    schema. ... Tests for unknown key dropped."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import {
  M03_DEFAULT_TEMPLATE,
  M03_SCHEMA_KEYS,
  resolveTemplateKeys,
  assertTemplateKeyKnown,
  filterContentByTemplate,
  isKeyRenderable,
  UnknownTemplateKeyError,
} from "./template.js";
import type { M03Template } from "@alinamatrix/contracts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FULL_TEMPLATE: M03Template = M03_DEFAULT_TEMPLATE;

const PARTIAL_TEMPLATE: M03Template = {
  id:      "m03-partial-v1",
  version: "1.0.0",
  sections: [
    { key: "metadata",    label: "Metadata" },
    { key: "context",     label: "Context" },
    { key: "decision",    label: "Decision" },
    { key: "limitations", label: "Limitations" },
  ],
};

const TEMPLATE_WITH_UNKNOWN: M03Template = {
  id:      "m03-unknown-v1",
  version: "1.0.0",
  sections: [
    { key: "metadata",     label: "Metadata" },
    { key: "bogusUnknown", label: "Bogus" },
  ],
};

// ===========================================================================
// M03_DEFAULT_TEMPLATE
// ===========================================================================

describe("M03_DEFAULT_TEMPLATE", () => {
  it("declares all known M03 schema keys", () => {
    const declaredKeys = M03_DEFAULT_TEMPLATE.sections.map((s) => s.key);
    for (const key of M03_SCHEMA_KEYS) {
      expect(declaredKeys).toContain(key);
    }
  });

  it("declares sections in the canonical order", () => {
    const declaredKeys = M03_DEFAULT_TEMPLATE.sections.map((s) => s.key);
    expect(declaredKeys).toEqual([...M03_SCHEMA_KEYS]);
  });

  it("has id m03-adr-v1", () => {
    expect(M03_DEFAULT_TEMPLATE.id).toBe("m03-adr-v1");
  });
});

// ===========================================================================
// resolveTemplateKeys
// ===========================================================================

describe("resolveTemplateKeys", () => {
  it("resolves all keys for the full template", () => {
    const keys = resolveTemplateKeys(FULL_TEMPLATE);
    expect(keys).toEqual([...M03_SCHEMA_KEYS]);
  });

  it("resolves only the declared keys for a partial template", () => {
    const keys = resolveTemplateKeys(PARTIAL_TEMPLATE);
    expect(keys).toEqual(["metadata", "context", "decision", "limitations"]);
  });

  it("drops keys not in the pinned schema (unknown keys dropped)", () => {
    const keys = resolveTemplateKeys(TEMPLATE_WITH_UNKNOWN);
    expect(keys).toEqual(["metadata"]);
    expect(keys).not.toContain("bogusUnknown");
  });

  it("returns keys in the template declared order", () => {
    const reversed: M03Template = {
      id:      "m03-reversed-v1",
      version: "1.0.0",
      sections: [
        { key: "limitations", label: "Limitations" },
        { key: "decision",    label: "Decision" },
        { key: "metadata",    label: "Metadata" },
      ],
    };
    const keys = resolveTemplateKeys(reversed);
    expect(keys).toEqual(["limitations", "decision", "metadata"]);
  });

  it("deduplicates repeated keys", () => {
    const dup: M03Template = {
      id:      "m03-dup-v1",
      version: "1.0.0",
      sections: [
        { key: "metadata", label: "Metadata" },
        { key: "metadata", label: "Metadata Again" },
        { key: "context",  label: "Context" },
      ],
    };
    const keys = resolveTemplateKeys(dup);
    expect(keys).toEqual(["metadata", "context"]);
  });

  it("returns empty for a template with only unknown keys", () => {
    const allUnknown: M03Template = {
      id:      "m03-all-unknown-v1",
      version: "1.0.0",
      sections: [
        { key: "bogus1", label: "Bogus 1" },
        { key: "bogus2", label: "Bogus 2" },
      ],
    };
    const keys = resolveTemplateKeys(allUnknown);
    expect(keys).toEqual([]);
  });
});

// ===========================================================================
// assertTemplateKeyKnown — unknown-key rejection
// ===========================================================================

describe("assertTemplateKeyKnown (unknown-key rejection)", () => {
  it("does not throw when all content keys are declared by the template", () => {
    expect(() =>
      assertTemplateKeyKnown(["metadata", "context"], PARTIAL_TEMPLATE),
    ).not.toThrow();
  });

  it("throws UnknownTemplateKeyError for a key not declared by the template", () => {
    expect(() =>
      assertTemplateKeyKnown(["metadata", "bogusUnknown"], PARTIAL_TEMPLATE),
    ).toThrow(UnknownTemplateKeyError);
  });

  it("the error message names the unknown key and the template id", () => {
    try {
      assertTemplateKeyKnown(["bogusUnknown"], PARTIAL_TEMPLATE);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(UnknownTemplateKeyError);
      const msg = (e as UnknownTemplateKeyError).message;
      expect(msg).toContain("bogusUnknown");
      expect(msg).toContain("m03-partial-v1");
    }
  });

  it("throws for the first unknown key found", () => {
    try {
      assertTemplateKeyKnown(
        ["metadata", "context", "totallyUnknown"],
        PARTIAL_TEMPLATE,
      );
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(UnknownTemplateKeyError);
      expect((e as UnknownTemplateKeyError).message).toContain("totallyUnknown");
    }
  });
});

// ===========================================================================
// filterContentByTemplate
// ===========================================================================

describe("filterContentByTemplate", () => {
  it("keeps only keys declared by the template", () => {
    const content = {
      metadata:     { id: "test" },
      context:      { background: "bg" },
      decision:     { decisionStatement: "ds" },
      limitations:   [{ description: "lim", category: "technical" }],
      bogusUnknown:  "should be dropped",
      anotherBogus:  { secret: "also dropped" },
    };
    const filtered = filterContentByTemplate(content, PARTIAL_TEMPLATE);
    expect(Object.keys(filtered).sort()).toEqual(
      ["context", "decision", "limitations", "metadata"],
    );
    expect(filtered["bogusUnknown"]).toBeUndefined();
    expect(filtered["anotherBogus"]).toBeUndefined();
  });

  it("does not mutate the input content", () => {
    const content = {
      metadata:    { id: "test" },
      bogusUnknown: "should be dropped",
    };
    const filtered = filterContentByTemplate(content, PARTIAL_TEMPLATE);
    expect(filtered).not.toBe(content);
    expect(Object.keys(content)).toContain("bogusUnknown");
  });

  it("drops all keys for a template with only unknown keys", () => {
    const content = {
      metadata:    { id: "test" },
      context:      { background: "bg" },
    };
    const allUnknown: M03Template = {
      id:      "m03-all-unknown-v2",
      version: "1.0.0",
      sections: [{ key: "bogusOnly", label: "Bogus" }],
    };
    const filtered = filterContentByTemplate(content, allUnknown);
    expect(Object.keys(filtered)).toHaveLength(0);
  });
});

// ===========================================================================
// isKeyRenderable
// ===========================================================================

describe("isKeyRenderable", () => {
  it("returns true for a key in both the template and the schema", () => {
    expect(isKeyRenderable("metadata", PARTIAL_TEMPLATE)).toBe(true);
    expect(isKeyRenderable("limitations", PARTIAL_TEMPLATE)).toBe(true);
  });

  it("returns false for a key not in the template", () => {
    expect(isKeyRenderable("risks", PARTIAL_TEMPLATE)).toBe(false);
  });

  it("returns false for a key in the template but not in the pinned schema", () => {
    expect(isKeyRenderable("bogusUnknown", TEMPLATE_WITH_UNKNOWN)).toBe(false);
  });
});
