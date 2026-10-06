/**
 * DB layer for release labels — Phase 9 Unit 1 (release gate).
 *
 * Table: release_labels.
 *
 * Immutability:
 *   - release_labels.published_html is immutable: a trigger rejects UPDATE of
 *     the published_html column. Label and revoked_at are updatable.
 *
 * Directive Phase 9:
 *   "Labels: DRAFT, INTERNAL_REVIEW, APPROVED, PUBLISHED, ARCHIVED, REVOKED."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { v4 as uuidv4 } from "uuid";
import type { DbClient } from "./client.js";

// ============================================================
// Row types
// ============================================================

export type ReleaseLabel =
  | "DRAFT"
  | "INTERNAL_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "ARCHIVED"
  | "REVOKED";

export interface ReleaseLabelRow {
  id:                     string;
  tenant_id:              string;
  project_id:             string;
  rendered_artifact_id:   string;
  label:                  ReleaseLabel;
  published_html:         string | null;
  published_html_sha256:  string | null;
  published_at:           Date | null;
  revoked_at:             Date | null;
  created_at:             Date;
  label_updated_at:       Date;
}

// ============================================================
// release_labels — CRUD
// ============================================================

export interface InsertReleaseLabelParams {
  tenantId:             string;
  projectId:            string;
  renderedArtifactId:   string;
  label?:               ReleaseLabel;
}

export async function insertReleaseLabel(
  client: DbClient,
  params: InsertReleaseLabelParams,
): Promise<ReleaseLabelRow> {
  const id = uuidv4();
  const res = await client.query<ReleaseLabelRow>(
    `INSERT INTO release_labels (id, tenant_id, project_id, rendered_artifact_id, label)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (rendered_artifact_id) DO NOTHING
     RETURNING *`,
    [
      id,
      params.tenantId,
      params.projectId,
      params.renderedArtifactId,
      params.label ?? "DRAFT",
    ],
  );
  if (res.rows.length === 0) {
    return getReleaseLabelByArtifact(client, params.renderedArtifactId);
  }
  return res.rows[0]!;
}

export async function getReleaseLabel(
  client: DbClient,
  labelId: string,
): Promise<ReleaseLabelRow | null> {
  const res = await client.query<ReleaseLabelRow>(
    `SELECT * FROM release_labels WHERE id = $1`,
    [labelId],
  );
  return res.rows[0] ?? null;
}

export async function getReleaseLabelByArtifact(
  client: DbClient,
  renderedArtifactId: string,
): Promise<ReleaseLabelRow> {
  const res = await client.query<ReleaseLabelRow>(
    `SELECT * FROM release_labels WHERE rendered_artifact_id = $1`,
    [renderedArtifactId],
  );
  if (res.rows.length === 0) {
    throw new Error(
      `Release label not found for rendered_artifact_id: ${renderedArtifactId}`,
    );
  }
  return res.rows[0]!;
}

export interface PublishReleaseLabelParams {
  renderedArtifactId:   string;
  publishedHtml:        string;
  publishedHtmlSha256:  string;
  publishedAt?:         Date;
}

/**
 * Transition a release label to PUBLISHED and set the immutable published HTML.
 * This is the only time published_html is set — after that, the trigger
 * rejects any UPDATE of the column.
 */
export async function publishReleaseLabel(
  client: DbClient,
  params: PublishReleaseLabelParams,
): Promise<ReleaseLabelRow> {
  const res = await client.query<ReleaseLabelRow>(
    `UPDATE release_labels
       SET label = 'PUBLISHED',
           published_html = $2,
           published_html_sha256 = $3,
           published_at = $4,
           label_updated_at = now()
     WHERE rendered_artifact_id = $1
     RETURNING *`,
    [
      params.renderedArtifactId,
      params.publishedHtml,
      params.publishedHtmlSha256,
      params.publishedAt ?? new Date(),
    ],
  );
  if (res.rows.length === 0) {
    throw new Error(
      `Release label not found for rendered_artifact_id: ${params.renderedArtifactId}`,
    );
  }
  return res.rows[0]!;
}

export async function updateReleaseLabel(
  client: DbClient,
  renderedArtifactId: string,
  label: ReleaseLabel,
): Promise<ReleaseLabelRow> {
  const revokedAt = label === "REVOKED" ? new Date() : null;
  const res = await client.query<ReleaseLabelRow>(
    `UPDATE release_labels
       SET label = $2,
           label_updated_at = now(),
           revoked_at = COALESCE($3, revoked_at)
     WHERE rendered_artifact_id = $1
     RETURNING *`,
    [renderedArtifactId, label, revokedAt],
  );
  if (res.rows.length === 0) {
    throw new Error(
      `Release label not found for rendered_artifact_id: ${renderedArtifactId}`,
    );
  }
  return res.rows[0]!;
}
