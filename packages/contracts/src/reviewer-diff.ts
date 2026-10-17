/**
 * Reviewer diff contracts — Phase E (Unit 1: reviewer diff between two builds).
 *
 * Zod schemas for the reviewer-facing diff between two stored builds:
 *   - ReviewerDiffInputSchema   — two build snapshots + reviewer id + tenant id.
 *   - ReviewerDiffResultSchema   — the diff result with reviewer attribution,
 *                                    a summary, and a deterministic diff hash.
 *
 * Directive Phase E:
 *   "Reviewer diff between two builds."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

// ============================================================
// Primitives
// ============================================================

const UuidString    = z.string().uuid();
const Sha256Hex     = z.string().length(64).regex(/^[0-9a-f]{64}$/);
const IsoUtc        = z.string().datetime();
const NonEmptyString = z.string().min(1).max(4096);

// ============================================================
// Reviewer diff snapshot (reuses BuildSnapshot fields)
// ============================================================

/**
 * A build snapshot for reviewer diff.
 *
 * Same fields as BuildSnapshot from timetravel.ts but defined here as a
 * contracts-level schema so the API boundary can validate it independently.
 */
export const ReviewerDiffSnapshotSchema = z.object({
  artifactId:        UuidString,
  buildId:          UuidString,
  htmlSha256:       Sha256Hex,
  contentHash:      Sha256Hex,
  manifestSha256:   Sha256Hex,
  sourceVersionIds: z.array(UuidString),
  buildTime:        IsoUtc,
});
export type ReviewerDiffSnapshot = z.infer<typeof ReviewerDiffSnapshotSchema>;

// ============================================================
// Reviewer diff entry
// ============================================================

export const ReviewerDiffFieldSchema = z.enum([
  "htmlSha256",
  "contentHash",
  "manifestSha256",
  "sourceVersionIds",
  "buildTime",
]);
export type ReviewerDiffField = z.infer<typeof ReviewerDiffFieldSchema>;

export const ReviewerDiffKindSchema = z.enum(["changed", "added", "removed"]);
export type ReviewerDiffKind = z.infer<typeof ReviewerDiffKindSchema>;

export const ReviewerDiffEntrySchema = z.object({
  field:  ReviewerDiffFieldSchema,
  kind:   ReviewerDiffKindSchema,
  before: z.union([z.string(), z.array(z.string())]),
  after:  z.union([z.string(), z.array(z.string())]),
});
export type ReviewerDiffEntry = z.infer<typeof ReviewerDiffEntrySchema>;

// ============================================================
// Reviewer diff result
// ============================================================

/**
 * The result of a reviewer diff between two builds.
 *
 * - `reviewerId`: the reviewer who requested the diff (attributed).
 * - `beforeBuildId` / `afterBuildId`: the two builds compared.
 * - `identical`: true when the two builds are byte-for-byte identical.
 * - `entries`: the list of diff entries (empty when identical).
 * - `summary`: a human-readable summary string.
 * - `diffHash`: deterministic SHA-256 over the canonical diff JSON.
 *
 * Directive: "Reviewer diff between two builds."
 */
export const ReviewerDiffResultSchema = z.object({
  reviewerId:     UuidString,
  tenantId:       UuidString,
  artifactId:     z.string(),
  beforeBuildId:  UuidString,
  afterBuildId:   UuidString,
  identical:      z.boolean(),
  entries:        z.array(ReviewerDiffEntrySchema),
  summary:        NonEmptyString,
  diffHash:       Sha256Hex,
});
export type ReviewerDiffResult = z.infer<typeof ReviewerDiffResultSchema>;
