/**
 * Merkle provenance ledger — Phase D (Unit 1: Merkle provenance ledger).
 *
 * Covers:
 *   - computeLeafHash — deterministic SHA-256 over the canonical leaf JSON
 *     (source version id, content hash, manifest sha256, html sha256).
 *   - computeMerkleRoot — fold the leaf hashes into a Merkle root (SHA-256,
 *     sorted leaves, left-right concatenation).
 *   - buildProvenanceLedgerEntry — assemble a ledger entry (leaf + leaf hash
 *     + Merkle root + sequence) from an ordered set of leaves.
 *   - verifyProvenanceLedger — re-fold the leaves and confirm the ledger root
 *     matches (tamper detection).
 *
 * Directive Phase D:
 *   "Merkle provenance ledger over source version, content hash, manifest,
 *    and html sha256. ... Append-only. Tenant isolated."
 *   "Tests for tamper detection."
 *
 * Determinism:
 *   - computeLeafHash uses JSON.stringify with sorted keys (canonical).
 *   - computeMerkleRoot sorts the leaf hashes before folding, so insertion
 *     order into the set does not change the root.
 *   - No Date.now() or Math.random() is used.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { createHash } from "node:crypto";
import type {
  ProvenanceLeaf,
  ProvenanceLedgerEntry,
} from "@alinamatrix/contracts";

// ============================================================
// Canonical leaf hash
// ============================================================

/**
 * Compute the deterministic SHA-256 of a provenance leaf.
 *
 * The hash is over the canonical (sorted-keys) JSON of the four leaf fields:
 *   sourceVersionId, contentHash, manifestSha256, htmlSha256.
 *
 * Same leaf → same hash, always.
 */
export function computeLeafHash(leaf: ProvenanceLeaf): string {
  const canonical = JSON.stringify(sortKeys(leaf));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Compute the deterministic SHA-256 of a manifest JSON value.
 *
 * The manifest is JSON-stringified with sorted keys to give a canonical form
 * independent of insertion order.
 */
export function computeManifestSha256(manifest: Record<string, unknown>): string {
  const canonical = JSON.stringify(sortKeys(manifest));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

// ============================================================
// Merkle root
// ============================================================

/**
 * Compute the Merkle root of a set of leaf hashes.
 *
 * Leaves are sorted before folding so the root is independent of insertion
 * order. For an empty set the root is the SHA-256 of the empty string.
 * For a single leaf the root is that leaf hash.
 *
 * Each pair (left, right) is concatenated as `left + right` and hashed. When
 * the layer has an odd number of nodes the last node is duplicated
 * (concatenated with itself) so the layer is even before folding.
 */
export function computeMerkleRoot(leafHashes: string[]): string {
  if (leafHashes.length === 0) {
    return createHash("sha256").update("", "utf8").digest("hex");
  }
  let layer = [...leafHashes].sort();
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left  = layer[i]!;
      const right = (i + 1 < layer.length) ? layer[i + 1]! : left;
      next.push(createHash("sha256").update(`${left}${right}`, "utf8").digest("hex"));
    }
    layer = next;
  }
  return layer[0]!;
}

// ============================================================
// Ledger entry assembly
// ============================================================

/**
 * Input to buildProvenanceLedgerEntry.
 *
 * The `leaves` are the ordered provenance leaves already recorded for the
 * artifact. The `newLeaf` is the leaf being appended. The entry records the
 * leaf hash, the Merkle root of all leaves up to and including the new leaf,
 * and the 1-based sequence position.
 */
export interface BuildProvenanceLedgerEntryInput {
  artifactId:  string;
  newLeaf:     ProvenanceLeaf;
  /** Already-recorded leaves, in ledger order. Empty for the first entry. */
  leaves:      ProvenanceLeaf[];
}

/**
 * Assemble a provenance ledger entry for a leaf being appended.
 *
 * The leaf hash is computed from the new leaf; the ledger root is the Merkle
 * root of all leaf hashes (existing + new), sorted before folding; the
 * sequence is `leaves.length + 1` (1-based).
 */
export function buildProvenanceLedgerEntry(
  input: BuildProvenanceLedgerEntryInput,
): ProvenanceLedgerEntry {
  const allLeaves = [...input.leaves, input.newLeaf];
  const leafHash  = computeLeafHash(input.newLeaf);
  const ledgerRoot = computeMerkleRoot(allLeaves.map(computeLeafHash));
  return {
    artifactId:       input.artifactId,
    sourceVersionId:  input.newLeaf.sourceVersionId,
    contentHash:      input.newLeaf.contentHash,
    manifestSha256:   input.newLeaf.manifestSha256,
    htmlSha256:        input.newLeaf.htmlSha256,
    leafHash,
    ledgerRoot,
    sequence:         allLeaves.length,
  };
}

// ============================================================
// Tamper detection
// ============================================================

/**
 * Verify a provenance ledger against a set of leaves.
 *
 * Re-folds the leaf hashes into a Merkle root and confirms the root matches
 * the recorded ledger root. Returns true when the ledger is intact and false
 * when any leaf has been tampered with (different leaf data → different leaf
 * hash → different Merkle root).
 *
 * Directive: "Tests for tamper detection."
 */
export function verifyProvenanceLedger(
  leaves: ProvenanceLeaf[],
  expectedRoot: string,
): boolean {
  return computeMerkleRoot(leaves.map(computeLeafHash)) === expectedRoot;
}

// ============================================================
// Errors
// ============================================================

export class ProvenanceLedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvenanceLedgerError";
  }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Recursively sort object keys for canonical JSON serialization.
 */
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
