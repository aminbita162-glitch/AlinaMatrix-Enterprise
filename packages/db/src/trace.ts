/**
 * DB layer for the code-to-document trace — Phase D (Unit 3: code-to-document trace).
 *
 * Table: code_to_document_traces (append-only — INSERT only).
 *
 * Immutability:
 *   - code_to_document_traces is INSERT-only. Triggers reject UPDATE and DELETE;
 *     GRANT excludes UPDATE and DELETE.
 *
 * Directive Phase D:
 *   "Code-to-document trace from a cited path to the claim and the rendered
 *    section. Append-only. Tenant isolated."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { v4 as uuidv4 } from "uuid";
import type { DbClient } from "./client.js";

// ============================================================
// Row types
// ============================================================

export interface TraceRow {
  id:              string;
  tenant_id:       string;
  cited_path:      string;
  claim_id:        string;
  artifact_id:     string;
  section:         string;
  created_at:      Date;
}

// ============================================================
// code_to_document_traces — append-only (INSERT only)
// ============================================================

export interface InsertTraceParams {
  tenantId:        string;
  citedPath:       string;
  claimId:         string;
  artifactId:      string;
  section:          string;
}

export async function insertTrace(
  client: DbClient,
  params: InsertTraceParams,
): Promise<TraceRow> {
  const id = uuidv4();
  const res = await client.query<TraceRow>(
    `INSERT INTO code_to_document_traces
       (id, tenant_id, cited_path, claim_id, artifact_id, section)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      id,
      params.tenantId,
      params.citedPath,
      params.claimId,
      params.artifactId,
      params.section,
    ],
  );
  return res.rows[0]!;
}

export async function listTracesByClaim(
  client: DbClient,
  claimId: string,
): Promise<TraceRow[]> {
  const res = await client.query<TraceRow>(
    `SELECT * FROM code_to_document_traces WHERE claim_id = $1 ORDER BY created_at ASC`,
    [claimId],
  );
  return res.rows;
}

export async function listTracesByArtifact(
  client: DbClient,
  artifactId: string,
): Promise<TraceRow[]> {
  const res = await client.query<TraceRow>(
    `SELECT * FROM code_to_document_traces WHERE artifact_id = $1 ORDER BY created_at ASC`,
    [artifactId],
  );
  return res.rows;
}

export async function findTraceByPathAndClaim(
  client: DbClient,
  citedPath: string,
  claimId: string,
): Promise<TraceRow | null> {
  const res = await client.query<TraceRow>(
    `SELECT * FROM code_to_document_traces
     WHERE cited_path = $1 AND claim_id = $2
     LIMIT 1`,
    [citedPath, claimId],
  );
  return res.rows[0] ?? null;
}
