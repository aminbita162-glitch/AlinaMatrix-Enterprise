/**
 * Provenance contracts — Phase D (Unit 1: Merkle provenance ledger).
 *
 * Zod schemas for the Merkle provenance ledger:
 *   - ProvenanceLeafSchema        — source version id, content hash, manifest
 *                                    sha256, html sha256. The four fields a
 *                                    ledger leaf pins.
 *   - ProvenanceLedgerEntrySchema — a leaf plus the artifact id, the leaf
 *                                    hash, the ledger Merkle root, and the
 *                                    1-based sequence number.
 *
 * Directive Phase D:
 *   "Merkle provenance ledger over source version, content hash, manifest,
 *    and html sha256. ... Append-only. Tenant isolated."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

// ============================================================
// Primitives
// ============================================================

const UuidString  = z.string().uuid();
const Sha256Hex   = z.string().length(64).regex(/^[0-9a-f]{64}$/);

// ============================================================
// Provenance leaf
// ============================================================

/**
 * A single provenance leaf: the four pinned fields from a build that the
 * Merkle ledger ties together.
 *
 * Directive: "Merkle provenance ledger over source version, content hash,
 * manifest, and html sha256."
 */
export const ProvenanceLeafSchema = z.object({
  /** Source version id referenced by this build. */
  sourceVersionId:  UuidString,
  /** SHA-256 of the approved content JSON. */
  contentHash:      Sha256Hex,
  /** SHA-256 of the canonical manifest JSON. */
  manifestSha256:   Sha256Hex,
  /** SHA-256 of the rendered HTML. */
  htmlSha256:        Sha256Hex,
});
export type ProvenanceLeaf = z.infer<typeof ProvenanceLeafSchema>;

// ============================================================
// Provenance ledger entry
// ============================================================

/**
 * One row in the provenance ledger.
 *
 * Append-only: the DB trigger (migration 012) rejects UPDATE and DELETE.
 * The leaf hash is computed from the leaf data; the ledger root is the
 * Merkle root of all leaf hashes up to and including this entry.
 */
export const ProvenanceLedgerEntrySchema = ProvenanceLeafSchema.extend({
  /** The rendered artifact this ledger entry belongs to. */
  artifactId:    UuidString,
  /** SHA-256 of the leaf data (deterministic from the four leaf fields). */
  leafHash:      Sha256Hex,
  /** Merkle root of all leaf hashes in the ledger up to this entry. */
  ledgerRoot:    Sha256Hex,
  /** 1-based position in the ledger. */
  sequence:      z.number().int().positive(),
});
export type ProvenanceLedgerEntry = z.infer<typeof ProvenanceLedgerEntrySchema>;
