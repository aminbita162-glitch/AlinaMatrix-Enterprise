/**
 * Code-to-document trace — Phase D (Unit 3: code-to-document trace).
 *
 * Covers:
 *   - buildTraceRecord — validate and assemble a trace record from a cited
 *     path to a claim and a rendered section.
 *   - assertTraceExists — throw MissingTraceError when no trace links a cited
 *     path to a claim (missing-trace rejection).
 *   - findTrace — pure lookup over a list of trace records.
 *
 * Directive Phase D:
 *   "Code-to-document trace from a cited path to the claim and the rendered
 *    section. Append-only. Tenant isolated. ... Tests for ... missing-trace
 *    rejection."
 *
 * Status: Enterprise Candidate — Active Development
 */
import type { TraceRecord } from "@alinamatrix/contracts";

// ============================================================
// Errors
// ============================================================

export class MissingTraceError extends Error {
  constructor(citedPath: string, claimId: string) {
    super(
      `No code-to-document trace links cited path "${citedPath}" to claim ${claimId}`,
    );
    this.name = "MissingTraceError";
  }
}

export class TraceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TraceInputError";
  }
}

// ============================================================
// buildTraceRecord
// ============================================================

export interface BuildTraceRecordInput {
  citedPath:   string;
  claimId:     string;
  artifactId:  string;
  section:      string;
  tenantId:     string;
}

/**
 * Validate and assemble a trace record.
 *
 * Throws TraceInputError when:
 *   - citedPath is empty.
 *   - section is empty.
 *   - claimId / artifactId / tenantId are not UUIDs (checked by the caller
 *     via Zod; this function does a structural emptiness check).
 *
 * The tenant id is server-derived (from the session membership) and is never
 * accepted from the client as the isolation authority (H03).
 */
export function buildTraceRecord(input: BuildTraceRecordInput): TraceRecord {
  if (input.citedPath.length === 0) {
    throw new TraceInputError("citedPath must not be empty");
  }
  if (input.section.length === 0) {
    throw new TraceInputError("section must not be empty");
  }
  if (input.tenantId.length === 0) {
    throw new TraceInputError("tenantId must not be empty");
  }
  return {
    citedPath:   input.citedPath,
    claimId:     input.claimId,
    artifactId:  input.artifactId,
    section:      input.section,
    tenantId:     input.tenantId,
  };
}

// ============================================================
// findTrace — pure lookup
// ============================================================

/**
 * Find a trace record linking a cited path to a claim.
 *
 * Returns the first matching record, or null when none match. A record
 * matches when citedPath and claimId both match (case-sensitive).
 */
export function findTrace(
  traces: TraceRecord[],
  citedPath: string,
  claimId: string,
): TraceRecord | null {
  return (
    traces.find((t) => t.citedPath === citedPath && t.claimId === claimId) ?? null
  );
}

// ============================================================
// assertTraceExists — missing-trace rejection
// ============================================================

/**
 * Assert that a trace exists linking a cited path to a claim.
 *
 * Throws MissingTraceError when no trace record matches. Used by the render
 * pipeline to reject rendering a claim whose cited path has no trace.
 *
 * Directive: "Tests for ... missing-trace rejection."
 */
export function assertTraceExists(
  traces: TraceRecord[],
  citedPath: string,
  claimId: string,
): TraceRecord {
  const found = findTrace(traces, citedPath, claimId);
  if (!found) {
    throw new MissingTraceError(citedPath, claimId);
  }
  return found;
}
