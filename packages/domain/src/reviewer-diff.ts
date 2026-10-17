/**
 * Reviewer diff between two builds — Phase E (Unit 1: reviewer diff).
 *
 * Covers:
 *   - buildReviewerDiff — compute a reviewer-facing diff between two stored
 *     builds with reviewer attribution, a human-readable summary, and a
 *     deterministic diff hash. The diff reuses the same field comparison as
 *     diffArtifacts (from Phase D) but adds reviewer id + tenant id + summary.
 *
 * Directive Phase E:
 *   "Reviewer diff between two builds."
 *
 * Determinism:
 *   - The diff hash is a pure function of (before, after, reviewerId, tenantId).
 *     Same inputs → same diffHash.
 *   - No Date.now() or Math.random() is used.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { createHash } from "node:crypto";
import type {
  ReviewerDiffSnapshot,
  ReviewerDiffResult,
  ReviewerDiffEntry,
} from "@alinamatrix/contracts";

// ============================================================
// Errors
// ============================================================

export class ReviewerDiffInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewerDiffInputError";
  }
}

// ============================================================
// buildReviewerDiff
// ============================================================

export interface BuildReviewerDiffInput {
  reviewerId:  string;
  tenantId:    string;
  before:      ReviewerDiffSnapshot;
  after:       ReviewerDiffSnapshot;
}

/**
 * Compute a reviewer-facing diff between two stored builds.
 *
 * The diff compares:
 *   - htmlSha256       — changed when different.
 *   - contentHash      — changed when different.
 *   - manifestSha256   — changed when different.
 *   - sourceVersionIds — added / removed per id (set difference, sorted).
 *   - buildTime        — changed when different (informational).
 *
 * The result includes:
 *   - `reviewerId` and `tenantId` — reviewer attribution.
 *   - `identical` — true when the two builds are byte-for-byte identical.
 *   - `entries` — the list of diff entries (empty when identical).
 *   - `summary` — a human-readable summary string.
 *   - `diffHash` — deterministic SHA-256 over the canonical diff JSON.
 *
 * Directive: "Reviewer diff between two builds."
 */
export function buildReviewerDiff(
  input: BuildReviewerDiffInput,
): ReviewerDiffResult {
  if (input.reviewerId.length === 0) {
    throw new ReviewerDiffInputError("reviewerId must not be empty");
  }
  if (input.tenantId.length === 0) {
    throw new ReviewerDiffInputError("tenantId must not be empty");
  }

  const { before, after, reviewerId, tenantId } = input;

  const entries: ReviewerDiffEntry[] = [];

  if (before.htmlSha256 !== after.htmlSha256) {
    entries.push({ field: "htmlSha256", kind: "changed", before: before.htmlSha256, after: after.htmlSha256 });
  }
  if (before.contentHash !== after.contentHash) {
    entries.push({ field: "contentHash", kind: "changed", before: before.contentHash, after: after.contentHash });
  }
  if (before.manifestSha256 !== after.manifestSha256) {
    entries.push({ field: "manifestSha256", kind: "changed", before: before.manifestSha256, after: after.manifestSha256 });
  }
  if (before.buildTime !== after.buildTime) {
    entries.push({ field: "buildTime", kind: "changed", before: before.buildTime, after: after.buildTime });
  }

  // Source version ids — set difference (added / removed).
  const beforeSet = new Set(before.sourceVersionIds);
  const afterSet  = new Set(after.sourceVersionIds);
  const added   = [...afterSet].filter((id) => !beforeSet.has(id)).sort();
  const removed = [...beforeSet].filter((id) => !afterSet.has(id)).sort();
  if (added.length > 0) {
    entries.push({ field: "sourceVersionIds", kind: "added", before: removed.length ? removed : [], after: added });
  }
  if (removed.length > 0) {
    entries.push({ field: "sourceVersionIds", kind: "removed", before: removed, after: added.length ? added : [] });
  }

  const identical = entries.length === 0;
  const artifactId = before.artifactId === after.artifactId ? before.artifactId : "";

  const summary = buildSummary(identical, entries, before.buildId, after.buildId);

  const canonical = JSON.stringify(sortKeys({
    reviewerId,
    tenantId,
    artifactId,
    beforeBuildId: before.buildId,
    afterBuildId: after.buildId,
    identical,
    entries,
  }));
  const diffHash = createHash("sha256").update(canonical, "utf8").digest("hex");

  return {
    reviewerId,
    tenantId,
    artifactId,
    beforeBuildId: before.buildId,
    afterBuildId: after.buildId,
    identical,
    entries,
    summary,
    diffHash,
  };
}

// ============================================================
// Helpers
// ============================================================

function buildSummary(
  identical: boolean,
  entries: ReviewerDiffEntry[],
  beforeBuildId: string,
  afterBuildId: string,
): string {
  if (identical) {
    return `Builds ${beforeBuildId} and ${afterBuildId} are identical — no differences found.`;
  }
  const changed = entries.filter((e) => e.kind === "changed").length;
  const added   = entries.filter((e) => e.kind === "added").length;
  const removed = entries.filter((e) => e.kind === "removed").length;
  const parts: string[] = [];
  if (changed > 0) parts.push(`${changed} changed`);
  if (added > 0)   parts.push(`${added} added`);
  if (removed > 0)  parts.push(`${removed} removed`);
  return `Builds ${beforeBuildId} and ${afterBuildId} differ: ${parts.join(", ")}.`;
}

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
