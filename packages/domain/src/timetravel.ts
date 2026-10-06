/**
 * Artifact time-travel diff — Phase D (Unit 2: artifact time-travel diff).
 *
 * Covers:
 *   - diffArtifacts — compute a deterministic, human-readable diff between two
 *     stored builds (rendered artifacts). The diff compares the HTML sha256,
 *     the content hash, the manifest sha256, and the source version ids.
 *     Returns a list of named diff entries (added / removed / changed) plus a
 *     boolean `identical` flag and a deterministic `diffHash`.
 *
 * Directive Phase D:
 *   "Artifact time-travel diff between two stored builds."
 *   "Tests for ... deterministic diff."
 *
 * Determinism:
 *   - The diff is a pure function of the two build snapshots. Same snapshots →
 *     same diff, same diffHash.
 *   - Source version ids are sorted before comparison so insertion order does
 *     not change the diff.
 *   - No Date.now() or Math.random() is used.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { createHash } from "node:crypto";

// ============================================================
// Build snapshot
// ============================================================

/**
 * A stored build snapshot — the fields a time-travel diff compares.
 *
 * Each field is the value recorded for a rendered artifact build. The diff
 * compares two snapshots field-by-field and reports the differences.
 */
export interface BuildSnapshot {
  /** Rendered artifact id (must match for a same-artifact diff). */
  artifactId:         string;
  /** Build id. */
  buildId:            string;
  /** SHA-256 of the rendered HTML. */
  htmlSha256:         string;
  /** SHA-256 of the approved content JSON. */
  contentHash:        string;
  /** SHA-256 of the canonical manifest JSON. */
  manifestSha256:     string;
  /** Source version ids referenced by this build. */
  sourceVersionIds:   string[];
  /** Build time (ISO-8601 UTC). */
  buildTime:          string;
}

// ============================================================
// Diff entry
// ============================================================

export type DiffField =
  | "htmlSha256"
  | "contentHash"
  | "manifestSha256"
  | "sourceVersionIds"
  | "buildTime";

export type DiffKind = "changed" | "added" | "removed";

export interface DiffEntry {
  field:    DiffField;
  kind:     DiffKind;
  before:   string | string[];
  after:    string | string[];
}

// ============================================================
// Diff result
// ============================================================

export interface DiffResult {
  /** The artifact id shared by both snapshots (or empty when they differ). */
  artifactId:    string;
  /** Build id of the before snapshot. */
  beforeBuildId: string;
  /** Build id of the after snapshot. */
  afterBuildId:  string;
  /** True when the two snapshots are byte-for-byte identical. */
  identical:     boolean;
  /** The list of diff entries (empty when identical). */
  entries:        DiffEntry[];
  /** Deterministic SHA-256 over the canonical diff JSON. */
  diffHash:      string;
}

// ============================================================
// diffArtifacts
// ============================================================

/**
 * Compute a deterministic diff between two stored build snapshots.
 *
 * The diff compares:
 *   - htmlSha256       — changed when different.
 *   - contentHash      — changed when different.
 *   - manifestSha256   — changed when different.
 *   - sourceVersionIds — added / removed per id (set difference).
 *   - buildTime        — changed when different (informational).
 *
 * The diff is deterministic: same snapshots → same entries, same diffHash.
 * Source version ids are sorted before comparison so insertion order does not
 * change the diff.
 *
 * Directive: "Artifact time-travel diff between two stored builds."
 */
export function diffArtifacts(before: BuildSnapshot, after: BuildSnapshot): DiffResult {
  const entries: DiffEntry[] = [];

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

  const canonical = JSON.stringify(sortKeys({
    artifactId,
    beforeBuildId: before.buildId,
    afterBuildId:  after.buildId,
    identical,
    entries,
  }));
  const diffHash = createHash("sha256").update(canonical, "utf8").digest("hex");

  return {
    artifactId,
    beforeBuildId: before.buildId,
    afterBuildId:  after.buildId,
    identical,
    entries,
    diffHash,
  };
}

// ============================================================
// Helpers
// ============================================================

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
