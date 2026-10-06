/**
 * Unit tests for packages/domain/src/trace.ts — code-to-document trace (Phase D Unit 3).
 *
 * Covers:
 *   - buildTraceRecord: assembles a valid trace record.
 *   - buildTraceRecord: rejects empty citedPath / section / tenantId.
 *   - findTrace: pure lookup, case-sensitive, returns null when no match.
 *   - assertTraceExists: throws MissingTraceError when no trace links a cited
 *     path to a claim (missing-trace rejection).
 *   - assertTraceExists: returns the trace when it exists.
 *
 * Directive Phase D:
 *   "Code-to-document trace from a cited path to the claim and the rendered
 *    section. ... Tests for ... missing-trace rejection."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import {
  buildTraceRecord,
  findTrace,
  assertTraceExists,
  MissingTraceError,
  TraceInputError,
} from "./trace.js";
import type { TraceRecord } from "@alinamatrix/contracts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_A    = "aaaaaaaa-0000-4000-a000-000000000001";
const CLAIM_ID    = "cccccccc-0000-4000-c000-000000000001";
const ARTIFACT_ID = "dddddddd-0000-4000-d000-000000000001";

function makeTrace(overrides: Partial<TraceRecord> = {}): TraceRecord {
  return {
    citedPath:   "docs/architecture.md",
    claimId:     CLAIM_ID,
    artifactId:  ARTIFACT_ID,
    section:      "System Overview",
    tenantId:     TENANT_A,
    ...overrides,
  };
}

// ===========================================================================
// buildTraceRecord
// ===========================================================================

describe("buildTraceRecord", () => {
  it("assembles a valid trace record", () => {
    const trace = buildTraceRecord({
      citedPath:   "docs/architecture.md",
      claimId:     CLAIM_ID,
      artifactId:  ARTIFACT_ID,
      section:      "System Overview",
      tenantId:     TENANT_A,
    });
    expect(trace.citedPath).toBe("docs/architecture.md");
    expect(trace.claimId).toBe(CLAIM_ID);
    expect(trace.artifactId).toBe(ARTIFACT_ID);
    expect(trace.section).toBe("System Overview");
    expect(trace.tenantId).toBe(TENANT_A);
  });

  it("rejects empty citedPath", () => {
    expect(() =>
      buildTraceRecord({
        citedPath:   "",
        claimId:     CLAIM_ID,
        artifactId:  ARTIFACT_ID,
        section:      "s",
        tenantId:     TENANT_A,
      }),
    ).toThrow(TraceInputError);
  });

  it("rejects empty section", () => {
    expect(() =>
      buildTraceRecord({
        citedPath:   "p",
        claimId:     CLAIM_ID,
        artifactId:  ARTIFACT_ID,
        section:      "",
        tenantId:     TENANT_A,
      }),
    ).toThrow(TraceInputError);
  });

  it("rejects empty tenantId", () => {
    expect(() =>
      buildTraceRecord({
        citedPath:   "p",
        claimId:     CLAIM_ID,
        artifactId:  ARTIFACT_ID,
        section:      "s",
        tenantId:     "",
      }),
    ).toThrow(TraceInputError);
  });
});

// ===========================================================================
// findTrace
// ===========================================================================

describe("findTrace", () => {
  it("returns the matching trace", () => {
    const traces = [makeTrace()];
    const result = findTrace(traces, "docs/architecture.md", CLAIM_ID);
    expect(result).not.toBeNull();
    expect(result?.citedPath).toBe("docs/architecture.md");
  });

  it("returns null when citedPath does not match", () => {
    const traces = [makeTrace()];
    const result = findTrace(traces, "docs/other.md", CLAIM_ID);
    expect(result).toBeNull();
  });

  it("returns null when claimId does not match", () => {
    const traces = [makeTrace()];
    const result = findTrace(traces, "docs/architecture.md", "ffffffff-0000-4000-f000-000000000002");
    expect(result).toBeNull();
  });

  it("is case-sensitive on citedPath", () => {
    const traces = [makeTrace({ citedPath: "Docs/Architecture.md" })];
    const result = findTrace(traces, "docs/architecture.md", CLAIM_ID);
    expect(result).toBeNull();
  });
});

// ===========================================================================
// assertTraceExists — missing-trace rejection
// ===========================================================================

describe("assertTraceExists (missing-trace rejection)", () => {
  it("returns the trace when it exists", () => {
    const traces = [makeTrace()];
    const result = assertTraceExists(traces, "docs/architecture.md", CLAIM_ID);
    expect(result.citedPath).toBe("docs/architecture.md");
  });

  it("throws MissingTraceError when no trace links the path to the claim", () => {
    const traces: TraceRecord[] = [];
    expect(() => assertTraceExists(traces, "docs/architecture.md", CLAIM_ID)).toThrow(MissingTraceError);
  });

  it("throws MissingTraceError when the path matches but the claim does not", () => {
    const traces = [makeTrace()];
    expect(() =>
      assertTraceExists(traces, "docs/architecture.md", "ffffffff-0000-4000-f000-000000000002"),
    ).toThrow(MissingTraceError);
  });

  it("the MissingTraceError message names the path and the claim", () => {
    const traces: TraceRecord[] = [];
    try {
      assertTraceExists(traces, "docs/architecture.md", CLAIM_ID);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(MissingTraceError);
      const msg = (e as MissingTraceError).message;
      expect(msg).toContain("docs/architecture.md");
      expect(msg).toContain(CLAIM_ID);
    }
  });
});
