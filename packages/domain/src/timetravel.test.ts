/**
 * Unit tests for packages/domain/src/timetravel.ts — artifact time-travel diff (Phase D Unit 2).
 *
 * Covers:
 *   - diffArtifacts: identical snapshots → identical=true, empty entries.
 *   - diffArtifacts: changed html sha256 → one "changed" entry.
 *   - diffArtifacts: changed content hash, manifest sha256, build time.
 *   - diffArtifacts: source version ids added / removed (set difference).
 *   - diffArtifacts: deterministic diff — same snapshots, same diffHash.
 *   - diffArtifacts: different snapshots, different diffHash.
 *
 * Directive Phase D:
 *   "Artifact time-travel diff between two stored builds."
 *   "Tests for ... deterministic diff."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { diffArtifacts } from "./timetravel.js";
import type { BuildSnapshot } from "./timetravel.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ARTIFACT_ID = "dddddddd-0000-4000-d000-000000000001";

function makeSnapshot(overrides: Partial<BuildSnapshot> = {}): BuildSnapshot {
  return {
    artifactId:        ARTIFACT_ID,
    buildId:           "11111111-0000-4000-b000-000000000001",
    htmlSha256:        "a".repeat(64),
    contentHash:       "b".repeat(64),
    manifestSha256:    "c".repeat(64),
    sourceVersionIds:  ["eeeeeeee-0000-4000-e000-000000000001"],
    buildTime:         "2026-10-06T12:00:00.000Z",
    ...overrides,
  };
}

// ===========================================================================
// Identical snapshots
// ===========================================================================

describe("diffArtifacts — identical snapshots", () => {
  it("identical snapshots return identical=true and empty entries", () => {
    const a = makeSnapshot();
    const result = diffArtifacts(a, a);
    expect(result.identical).toBe(true);
    expect(result.entries).toHaveLength(0);
  });

  it("identical snapshots have a 64-char hex diffHash", () => {
    const result = diffArtifacts(makeSnapshot(), makeSnapshot());
    expect(result.diffHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("identical snapshots are deterministic — same diffHash", () => {
    const a = makeSnapshot();
    const r1 = diffArtifacts(a, makeSnapshot());
    const r2 = diffArtifacts(makeSnapshot(), a);
    expect(r1.diffHash).toBe(r2.diffHash);
  });
});

// ===========================================================================
// Changed fields
// ===========================================================================

describe("diffArtifacts — changed fields", () => {
  it("changed html sha256 produces one changed entry", () => {
    const before = makeSnapshot();
    const after  = makeSnapshot({ htmlSha256: "z".repeat(64) });
    const result = diffArtifacts(before, after);
    expect(result.identical).toBe(false);
    const htmlEntry = result.entries.find((e) => e.field === "htmlSha256");
    expect(htmlEntry).toBeDefined();
    expect(htmlEntry?.kind).toBe("changed");
    expect(htmlEntry?.before).toBe("a".repeat(64));
    expect(htmlEntry?.after).toBe("z".repeat(64));
  });

  it("changed content hash produces a changed entry", () => {
    const before = makeSnapshot();
    const after  = makeSnapshot({ contentHash: "z".repeat(64) });
    const result = diffArtifacts(before, after);
    expect(result.entries.find((e) => e.field === "contentHash")).toBeDefined();
  });

  it("changed manifest sha256 produces a changed entry", () => {
    const before = makeSnapshot();
    const after  = makeSnapshot({ manifestSha256: "z".repeat(64) });
    const result = diffArtifacts(before, after);
    expect(result.entries.find((e) => e.field === "manifestSha256")).toBeDefined();
  });

  it("changed build time produces a changed entry", () => {
    const before = makeSnapshot();
    const after  = makeSnapshot({ buildTime: "2026-10-07T12:00:00.000Z" });
    const result = diffArtifacts(before, after);
    expect(result.entries.find((e) => e.field === "buildTime")).toBeDefined();
  });

  it("multiple changes produce multiple entries", () => {
    const before = makeSnapshot();
    const after  = makeSnapshot({
      htmlSha256:     "z".repeat(64),
      contentHash:    "y".repeat(64),
      manifestSha256: "x".repeat(64),
    });
    const result = diffArtifacts(before, after);
    expect(result.entries.length).toBeGreaterThanOrEqual(3);
  });
});

// ===========================================================================
// Source version ids — added / removed
// ===========================================================================

describe("diffArtifacts — source version ids", () => {
  it("added source version id produces an added entry", () => {
    const before = makeSnapshot({ sourceVersionIds: [] });
    const after  = makeSnapshot({
      sourceVersionIds: ["eeeeeeee-0000-4000-e000-000000000001"],
    });
    const result = diffArtifacts(before, after);
    const added = result.entries.find((e) => e.field === "sourceVersionIds" && e.kind === "added");
    expect(added).toBeDefined();
  });

  it("removed source version id produces a removed entry", () => {
    const before = makeSnapshot({
      sourceVersionIds: ["eeeeeeee-0000-4000-e000-000000000001"],
    });
    const after  = makeSnapshot({ sourceVersionIds: [] });
    const result = diffArtifacts(before, after);
    const removed = result.entries.find((e) => e.field === "sourceVersionIds" && e.kind === "removed");
    expect(removed).toBeDefined();
  });

  it("reordered but same source version ids produces no entry", () => {
    const v1 = "eeeeeeee-0000-4000-e000-000000000001";
    const v2 = "ffffffff-0000-4000-f000-000000000002";
    const before = makeSnapshot({ sourceVersionIds: [v1, v2] });
    const after  = makeSnapshot({ sourceVersionIds: [v2, v1] });
    const result = diffArtifacts(before, after);
    expect(result.entries.find((e) => e.field === "sourceVersionIds")).toBeUndefined();
  });
});

// ===========================================================================
// Deterministic diff
// ===========================================================================

describe("diffArtifacts — deterministic diff", () => {
  it("same snapshots produce the same diffHash", () => {
    const before = makeSnapshot();
    const after  = makeSnapshot({ htmlSha256: "z".repeat(64) });
    const r1 = diffArtifacts(before, after);
    const r2 = diffArtifacts(before, after);
    expect(r1.diffHash).toBe(r2.diffHash);
  });

  it("different snapshots produce different diffHash", () => {
    const before = makeSnapshot();
    const r1 = diffArtifacts(before, makeSnapshot({ htmlSha256: "z".repeat(64) }));
    const r2 = diffArtifacts(before, makeSnapshot({ htmlSha256: "y".repeat(64) }));
    expect(r1.diffHash).not.toBe(r2.diffHash);
  });

  it("identical diff from swapped identical snapshots", () => {
    const a = makeSnapshot();
    const r1 = diffArtifacts(a, a);
    expect(r1.identical).toBe(true);
    expect(r1.diffHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("carries the before and after build ids", () => {
    const before = makeSnapshot({ buildId: "11111111-0000-4000-b000-000000000001" });
    const after  = makeSnapshot({ buildId: "22222222-0000-4000-b000-000000000002" });
    const result = diffArtifacts(before, after);
    expect(result.beforeBuildId).toBe("11111111-0000-4000-b000-000000000001");
    expect(result.afterBuildId).toBe("22222222-0000-4000-b000-000000000002");
  });
});
