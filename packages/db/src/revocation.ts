/**
 * DB layer for revocation events — Phase 9 Unit 4 (revocation).
 *
 * Table: revocation_events (append-only — INSERT only).
 *
 * Immutability:
 *   - revocation_events is INSERT-only. Triggers reject UPDATE and DELETE;
 *     GRANT excludes UPDATE and DELETE.
 *
 * Directive Phase 9:
 *   "Revoke writes an event. It does not mutate published bytes."
 *
 * The published_html in release_labels is protected by the migration 008
 * trigger — so revocation never mutates published bytes.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { v4 as uuidv4 } from "uuid";
import type { DbClient } from "./client.js";

// ============================================================
// Row types
// ============================================================

export type RevocationPriorLabel =
  | "DRAFT"
  | "INTERNAL_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "ARCHIVED"
  | "REVOKED";

export interface RevocationEventRow {
  id:             string;
  tenant_id:       string;
  artifact_id:     string;
  revoked_by:      string;
  reason:          string;
  revoked_at:      Date;
  prior_label:     RevocationPriorLabel;
  created_at:      Date;
}

// ============================================================
// revocation_events — append-only (INSERT only)
// ============================================================

export interface InsertRevocationEventParams {
  tenantId:        string;
  artifactId:      string;
  revokedBy:       string;
  reason:          string;
  priorLabel:      RevocationPriorLabel;
  revokedAt?:      Date;
}

export async function insertRevocationEvent(
  client: DbClient,
  params: InsertRevocationEventParams,
): Promise<RevocationEventRow> {
  const id = uuidv4();
  const res = await client.query<RevocationEventRow>(
    `INSERT INTO revocation_events
       (id, tenant_id, artifact_id, revoked_by, reason, revoked_at, prior_label)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      id,
      params.tenantId,
      params.artifactId,
      params.revokedBy,
      params.reason,
      params.revokedAt ?? new Date(),
      params.priorLabel,
    ],
  );
  return res.rows[0]!;
}

export async function listRevocationEventsByArtifact(
  client: DbClient,
  artifactId: string,
): Promise<RevocationEventRow[]> {
  const res = await client.query<RevocationEventRow>(
    `SELECT * FROM revocation_events WHERE artifact_id = $1 ORDER BY revoked_at ASC`,
    [artifactId],
  );
  return res.rows;
}
