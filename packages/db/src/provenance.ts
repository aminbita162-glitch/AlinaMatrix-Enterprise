/**
 * DB layer for the provenance ledger — Phase D (Unit 1: Merkle provenance ledger).
 *
 * Table: provenance_ledger (append-only — INSERT only).
 *
 * Immutability:
 *   - provenance_ledger is INSERT-only. Triggers reject UPDATE and DELETE;
 *     GRANT excludes UPDATE and DELETE.
 *   - The ledger root is computed by the domain layer (computeMerkleRoot) and
 *     stored as a column; the DB does not recompute it.
 *
 * Directive Phase D:
 *   "Merkle provenance ledger over source version, content hash, manifest,
 *    and html sha256. ... Append-only. Tenant isolated."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { v4 as uuidv4 } from "uuid";
import type { DbClient } from "./client.js";

// ============================================================
// Row types
// ============================================================

export interface ProvenanceLedgerRow {
  id:                  string;
  tenant_id:           string;
  artifact_id:         string;
  source_version_id:   string;
  content_hash:        string;
  manifest_sha256:     string;
  html_sha256:         string;
  leaf_hash:           string;
  ledger_root:         string;
  sequence:            number;
  created_at:          Date;
}

// ============================================================
// provenance_ledger — append-only (INSERT only)
// ============================================================

export interface InsertProvenanceLedgerParams {
  tenantId:           string;
  artifactId:         string;
  sourceVersionId:    string;
  contentHash:        string;
  manifestSha256:     string;
  htmlSha256:         string;
  leafHash:           string;
  ledgerRoot:          string;
  sequence:           number;
}

export async function insertProvenanceLedgerEntry(
  client: DbClient,
  params: InsertProvenanceLedgerParams,
): Promise<ProvenanceLedgerRow> {
  const id = uuidv4();
  const res = await client.query<ProvenanceLedgerRow>(
    `INSERT INTO provenance_ledger
       (id, tenant_id, artifact_id, source_version_id,
        content_hash, manifest_sha256, html_sha256,
        leaf_hash, ledger_root, sequence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      id,
      params.tenantId,
      params.artifactId,
      params.sourceVersionId,
      params.contentHash,
      params.manifestSha256,
      params.htmlSha256,
      params.leafHash,
      params.ledgerRoot,
      params.sequence,
    ],
  );
  return res.rows[0]!;
}

export async function listProvenanceLedgerByArtifact(
  client: DbClient,
  artifactId: string,
): Promise<ProvenanceLedgerRow[]> {
  const res = await client.query<ProvenanceLedgerRow>(
    `SELECT * FROM provenance_ledger WHERE artifact_id = $1 ORDER BY sequence ASC`,
    [artifactId],
  );
  return res.rows;
}

export async function getProvenanceLedgerRoot(
  client: DbClient,
  artifactId: string,
): Promise<ProvenanceLedgerRow | null> {
  const res = await client.query<ProvenanceLedgerRow>(
    `SELECT * FROM provenance_ledger
     WHERE artifact_id = $1
     ORDER BY sequence DESC
     LIMIT 1`,
    [artifactId],
  );
  return res.rows[0] ?? null;
}
