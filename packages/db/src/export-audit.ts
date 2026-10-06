/**
 * DB layer for export audit — Phase 9 Unit 2 (export bundle).
 *
 * Table: export_audit (append-only — INSERT only).
 *
 * Immutability:
 *   - export_audit is INSERT-only. Triggers reject UPDATE and DELETE;
 *     GRANT excludes UPDATE and DELETE.
 *
 * Directive Phase 9:
 *   "Export HTML only with permission. Audit it."
 *   "Audit append-only."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { v4 as uuidv4 } from "uuid";
import type { DbClient } from "./client.js";

// ============================================================
// Row types
// ============================================================

export interface ExportAuditRow {
  id:             string;
  tenant_id:      string;
  artifact_id:    string;
  exported_by:    string;
  permitted:      boolean;
  denied_reason:  string | null;
  watermarked:    boolean;
  html_sha256:    string | null;
  exported_at:    Date;
  created_at:     Date;
}

// ============================================================
// export_audit — append-only (INSERT only)
// ============================================================

export interface InsertExportAuditParams {
  tenantId:      string;
  artifactId:    string;
  exportedBy:    string;
  permitted:     boolean;
  deniedReason?: string | null;
  watermarked?:  boolean;
  htmlSha256?:   string | null;
}

export async function insertExportAudit(
  client: DbClient,
  params: InsertExportAuditParams,
): Promise<ExportAuditRow> {
  const id = uuidv4();
  const res = await client.query<ExportAuditRow>(
    `INSERT INTO export_audit
       (id, tenant_id, artifact_id, exported_by, permitted, denied_reason, watermarked, html_sha256)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      id,
      params.tenantId,
      params.artifactId,
      params.exportedBy,
      params.permitted,
      params.deniedReason ?? null,
      params.watermarked ?? false,
      params.htmlSha256 ?? null,
    ],
  );
  return res.rows[0]!;
}

export async function listExportAuditByArtifact(
  client: DbClient,
  artifactId: string,
): Promise<ExportAuditRow[]> {
  const res = await client.query<ExportAuditRow>(
    `SELECT * FROM export_audit WHERE artifact_id = $1 ORDER BY exported_at ASC`,
    [artifactId],
  );
  return res.rows;
}
