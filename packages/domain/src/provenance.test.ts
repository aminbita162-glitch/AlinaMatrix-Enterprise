/**
 * Unit tests for packages/domain/src/provenance.ts — Merkle provenance ledger (Phase D Unit 1).
 *
 * Covers:
 *   - computeLeafHash: deterministic, canonical (sorted keys), independent of
 *     field insertion order.
 *   - computeMerkleRoot: empty set, single leaf, many leaves, order-independent
 *     (sorted before fold).
 *   - buildProvenanceLedgerEntry: 1-based sequence, leaf hash, ledger root.
 *   - verifyProvenanceLedger: intact ledger passes, tampered leaf fails
 *     (tamper detection).
 *   - computeManifestSha256: deterministic, canonical.
 *
 * Directive Phase D:
 *   "Merkle provenance ledger over source version, content hash, manifest,
 *    and html sha256. ... Tests for tamper detection."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  computeLeafHash,
  computeMerkleRoot,
  computeManifestSha256,
  buildProvenanceLedgerEntry,
  verifyProvenanceLedger,
  ProvenanceLedgerError,
} from "./provenance.js";
import type { ProvenanceLeaf } from "@alinamatrix/contracts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LEAF_A: ProvenanceLeaf = {
  sourceVersionId: "aaaaaaaa-0000-4000-a000-000000000001",
  contentHash:      "a".repeat(64),
  manifestSha256:   "b".repeat(64),
  htmlSha256:        "c".repeat(64),
};

const LEAF_B: ProvenanceLeaf = {
  sourceVersionId: "bbbbbbbb-0000-4000-b000-000000000002",
  contentHash:      "d".repeat(64),
  manifestSha256:   "e".repeat(64),
  htmlSha256:        "f".repeat(64),
};

// ===========================================================================
// computeLeafHash
// ===========================================================================

describe("computeLeafHash", () => {
  it("is deterministic for the same leaf", () => {
    expect(computeLeafHash(LEAF_A)).toBe(computeLeafHash(LEAF_A));
  });

  it("is canonical — field insertion order does not change the hash", () => {
    const ordered: ProvenanceLeaf = {
      sourceVersionId: LEAF_A.sourceVersionId,
      contentHash:     LEAF_A.contentHash,
      manifestSha256:  LEAF_A.manifestSha256,
      htmlSha256:       LEAF_A.htmlSha256,
    };
    const reordered: ProvenanceLeaf = {
      htmlSha256:       LEAF_A.htmlSha256,
      manifestSha256:  LEAF_A.manifestSha256,
      contentHash:     LEAF_A.contentHash,
      sourceVersionId: LEAF_A.sourceVersionId,
    };
    expect(computeLeafHash(ordered)).toBe(computeLeafHash(reordered));
  });

  it("differs for different leaves", () => {
    expect(computeLeafHash(LEAF_A)).not.toBe(computeLeafHash(LEAF_B));
  });

  it("produces a 64-char hex sha256", () => {
    expect(computeLeafHash(LEAF_A)).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ===========================================================================
// computeMerkleRoot
// ===========================================================================

describe("computeMerkleRoot", () => {
  it("empty set is the sha256 of the empty string", () => {
    const empty = computeMerkleRoot([]);
    const expected = createHash("sha256").update("", "utf8").digest("hex");
    expect(empty).toBe(expected);
  });

  it("single leaf root equals the leaf hash", () => {
    const h = computeLeafHash(LEAF_A);
    expect(computeMerkleRoot([h])).toBe(h);
  });

  it("many leaves produce a 64-char hex root", () => {
    const root = computeMerkleRoot([computeLeafHash(LEAF_A), computeLeafHash(LEAF_B)]);
    expect(root).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is order-independent (sorted before fold)", () => {
    const ha = computeLeafHash(LEAF_A);
    const hb = computeLeafHash(LEAF_B);
    expect(computeMerkleRoot([ha, hb])).toBe(computeMerkleRoot([hb, ha]));
  });

  it("differs when a leaf changes", () => {
    const ha = computeLeafHash(LEAF_A);
    const hb = computeLeafHash(LEAF_B);
    expect(computeMerkleRoot([ha])).not.toBe(computeMerkleRoot([hb]));
  });
});

// ===========================================================================
// buildProvenanceLedgerEntry
// ===========================================================================

describe("buildProvenanceLedgerEntry", () => {
  const ARTIFACT_ID = "dddddddd-0000-4000-d000-000000000001";

  it("first entry has sequence 1", () => {
    const entry = buildProvenanceLedgerEntry({
      artifactId: ARTIFACT_ID,
      newLeaf:    LEAF_A,
      leaves:      [],
    });
    expect(entry.sequence).toBe(1);
  });

  it("leaf hash matches computeLeafHash", () => {
    const entry = buildProvenanceLedgerEntry({
      artifactId: ARTIFACT_ID,
      newLeaf:    LEAF_A,
      leaves:      [],
    });
    expect(entry.leafHash).toBe(computeLeafHash(LEAF_A));
  });

  it("ledger root matches computeMerkleRoot of all leaf hashes", () => {
    const entry = buildProvenanceLedgerEntry({
      artifactId: ARTIFACT_ID,
      newLeaf:    LEAF_B,
      leaves:      [LEAF_A],
    });
    expect(entry.ledgerRoot).toBe(
      computeMerkleRoot([computeLeafHash(LEAF_A), computeLeafHash(LEAF_B)]),
    );
  });

  it("sequence is 1-based and increments with existing leaves", () => {
    const entry = buildProvenanceLedgerEntry({
      artifactId: ARTIFACT_ID,
      newLeaf:    LEAF_B,
      leaves:      [LEAF_A],
    });
    expect(entry.sequence).toBe(2);
  });

  it("carries the leaf fields onto the entry", () => {
    const entry = buildProvenanceLedgerEntry({
      artifactId: ARTIFACT_ID,
      newLeaf:    LEAF_A,
      leaves:      [],
    });
    expect(entry.artifactId).toBe(ARTIFACT_ID);
    expect(entry.sourceVersionId).toBe(LEAF_A.sourceVersionId);
    expect(entry.contentHash).toBe(LEAF_A.contentHash);
    expect(entry.manifestSha256).toBe(LEAF_A.manifestSha256);
    expect(entry.htmlSha256).toBe(LEAF_A.htmlSha256);
  });
});

// ===========================================================================
// verifyProvenanceLedger — tamper detection
// ===========================================================================

describe("verifyProvenanceLedger (tamper detection)", () => {
  const ARTIFACT_ID = "dddddddd-0000-4000-d000-000000000001";

  it("intact ledger passes", () => {
    const entry = buildProvenanceLedgerEntry({
      artifactId: ARTIFACT_ID,
      newLeaf:    LEAF_A,
      leaves:      [],
    });
    expect(verifyProvenanceLedger([LEAF_A], entry.ledgerRoot)).toBe(true);
  });

  it("tampered leaf fails (different content hash)", () => {
    const entry = buildProvenanceLedgerEntry({
      artifactId: ARTIFACT_ID,
      newLeaf:    LEAF_A,
      leaves:      [],
    });
    const tampered: ProvenanceLeaf = {
      ...LEAF_A,
      contentHash: "z".repeat(64),
    };
    expect(verifyProvenanceLedger([tampered], entry.ledgerRoot)).toBe(false);
  });

  it("tampered leaf fails (different html sha256)", () => {
    const entry = buildProvenanceLedgerEntry({
      artifactId: ARTIFACT_ID,
      newLeaf:    LEAF_A,
      leaves:      [],
    });
    const tampered: ProvenanceLeaf = {
      ...LEAF_A,
      htmlSha256: "z".repeat(64),
    };
    expect(verifyProvenanceLedger([tampered], entry.ledgerRoot)).toBe(false);
  });

  it("multi-leaf intact ledger passes", () => {
    const entry = buildProvenanceLedgerEntry({
      artifactId: ARTIFACT_ID,
      newLeaf:    LEAF_B,
      leaves:      [LEAF_A],
    });
    expect(verifyProvenanceLedger([LEAF_A, LEAF_B], entry.ledgerRoot)).toBe(true);
  });

  it("multi-leaf tampered ledger fails", () => {
    const entry = buildProvenanceLedgerEntry({
      artifactId: ARTIFACT_ID,
      newLeaf:    LEAF_B,
      leaves:      [LEAF_A],
    });
    const tampered: ProvenanceLeaf = { ...LEAF_B, contentHash: "z".repeat(64) };
    expect(verifyProvenanceLedger([LEAF_A, tampered], entry.ledgerRoot)).toBe(false);
  });

  it("missing leaf fails (fewer leaves than recorded)", () => {
    const entry = buildProvenanceLedgerEntry({
      artifactId: ARTIFACT_ID,
      newLeaf:    LEAF_B,
      leaves:      [LEAF_A],
    });
    expect(verifyProvenanceLedger([LEAF_A], entry.ledgerRoot)).toBe(false);
  });
});

// ===========================================================================
// computeManifestSha256
// ===========================================================================

describe("computeManifestSha256", () => {
  it("is deterministic", () => {
    const m = { a: 1, b: 2 };
    expect(computeManifestSha256(m)).toBe(computeManifestSha256(m));
  });

  it("is canonical — key order does not change the hash", () => {
    const a = { a: 1, b: 2 };
    const b = { b: 2, a: 1 };
    expect(computeManifestSha256(a)).toBe(computeManifestSha256(b));
  });

  it("differs for different manifest content", () => {
    expect(computeManifestSha256({ a: 1 })).not.toBe(computeManifestSha256({ a: 2 }));
  });
});

// ===========================================================================
// Error class
// ===========================================================================

describe("ProvenanceLedgerError", () => {
  it("carries the message and name", () => {
    const err = new ProvenanceLedgerError("boom");
    expect(err.message).toBe("boom");
    expect(err.name).toBe("ProvenanceLedgerError");
  });
});
