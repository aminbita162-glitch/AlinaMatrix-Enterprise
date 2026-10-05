import { describe, it, expect } from "vitest";
import { assertLegalTransition, isLegalTransition, IllegalTransitionError } from "../src/index.js";
import type { WorkflowState } from "../src/index.js";

describe("workflow transitions", () => {
  it("allows INGESTED -> CLASSIFIED", () => {
    expect(() => assertLegalTransition("INGESTED", "CLASSIFIED")).not.toThrow();
  });

  it("allows INGESTED -> FAILED_RETRYABLE", () => {
    expect(() => assertLegalTransition("INGESTED", "FAILED_RETRYABLE")).not.toThrow();
  });

  it("allows full happy path", () => {
    const path: WorkflowState[] = [
      "INGESTED",
      "CLASSIFIED",
      "EXTRACTED",
      "EVIDENCE_READY",
      "ARCHITECTED",
      "GENERATED",
      "VALIDATING",
      "NEEDS_REVIEW",
      "APPROVED",
      "BUILDING",
      "BUILT",
      "RELEASED",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i] as WorkflowState;
      const to = path[i + 1] as WorkflowState;
      expect(() => assertLegalTransition(from, to), `${from} -> ${to}`).not.toThrow();
    }
  });

  it("rejects INGESTED -> RELEASED (raw-to-RELEASED path blocked)", () => {
    expect(() => assertLegalTransition("INGESTED", "RELEASED")).toThrow(IllegalTransitionError);
  });

  it("rejects INGESTED -> APPROVED", () => {
    expect(() => assertLegalTransition("INGESTED", "APPROVED")).toThrow(IllegalTransitionError);
  });

  it("rejects RELEASED -> INGESTED", () => {
    expect(() => assertLegalTransition("RELEASED", "INGESTED")).toThrow(IllegalTransitionError);
  });

  it("rejects CANCELLED -> CLASSIFIED", () => {
    expect(() => assertLegalTransition("CANCELLED", "CLASSIFIED")).toThrow(IllegalTransitionError);
  });

  it("rejects FAILED_TERMINAL -> anything", () => {
    const targets: WorkflowState[] = ["INGESTED", "CLASSIFIED", "RELEASED"];
    for (const target of targets) {
      expect(() => assertLegalTransition("FAILED_TERMINAL", target)).toThrow(
        IllegalTransitionError,
      );
    }
  });

  it("rejects GENERATED -> RELEASED (skipping validation)", () => {
    expect(() => assertLegalTransition("GENERATED", "RELEASED")).toThrow(IllegalTransitionError);
  });

  it("isLegalTransition returns false for illegal transitions", () => {
    expect(isLegalTransition("INGESTED", "RELEASED")).toBe(false);
    expect(isLegalTransition("FAILED_TERMINAL", "INGESTED")).toBe(false);
  });

  it("isLegalTransition returns true for legal transitions", () => {
    expect(isLegalTransition("INGESTED", "CLASSIFIED")).toBe(true);
    expect(isLegalTransition("APPROVED", "BUILDING")).toBe(true);
  });

  it("IllegalTransitionError message includes from and to states", () => {
    try {
      assertLegalTransition("INGESTED", "RELEASED");
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalTransitionError);
      expect((e as Error).message).toContain("INGESTED");
      expect((e as Error).message).toContain("RELEASED");
    }
  });
});
