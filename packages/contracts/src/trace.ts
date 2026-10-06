/**
 * Trace contracts — Phase D (Unit 3: code-to-document trace).
 *
 * Zod schemas for the code-to-document trace:
 *   - TraceRecordSchema — a cited source path, the claim it supports, and the
 *     rendered section it appears in. Append-only.
 *
 * Directive Phase D:
 *   "Code-to-document trace from a cited path to the claim and the rendered
 *    section. Append-only. Tenant isolated. ... Tests for ... missing-trace
 *    rejection."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

// ============================================================
// Primitives
// ============================================================

const UuidString      = z.string().uuid();
const NonEmptyString  = z.string().min(1).max(4096);
const ShortString     = z.string().min(1).max(512);

// ============================================================
// Trace record
// ============================================================

/**
 * A code-to-document trace record.
 *
 * Links a cited source path (the evidence) to the claim it supports and the
 * rendered section where it appears. Append-only: the DB trigger (migration
 * 013) rejects UPDATE and DELETE.
 *
 * Directive: "Code-to-document trace from a cited path to the claim and the
 * rendered section. Append-only."
 */
export const TraceRecordSchema = z.object({
  /** The cited source path (file path or URI within the source document). */
  citedPath:      NonEmptyString,
  /** The claim id this trace supports. */
  claimId:        UuidString,
  /** The rendered artifact id where the section appears. */
  artifactId:     UuidString,
  /** The rendered section heading or anchor where the claim is rendered. */
  section:        ShortString,
  /** The tenant id (server-derived; never client-supplied as authority). */
  tenantId:       UuidString,
});
export type TraceRecord = z.infer<typeof TraceRecordSchema>;
