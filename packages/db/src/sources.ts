/**
 * Database access layer for sources, source_versions, source_fragments, evidence_items.
 *
 * All functions receive a pg.PoolClient whose tenant context must already be set
 * by the caller (via setTenantContext / withTenantContext).
 *
 * Status: Enterprise Candidate — Active Development
 */
import type pg from "pg";
import type { TextFragment } from "@alinamatrix/domain";

// ============================================================
// Row types
// ============================================================

export interface SourceRow {
  id:         string;
  tenant_id:  string;
  project_id: string;
  name:       string;
  mime_type:  string;
  created_at: Date;
  updated_at: Date;
}

export type VersionStatus = "INGESTED" | "EXTRACTED" | "FAILED_TERMINAL";

export interface SourceVersionRow {
  id:               string;
  source_id:        string;
  tenant_id:        string;
  sha256:           string;
  size_bytes:       string; // pg returns bigint as string
  storage_path:     string;
  idempotency_key:  string;
  status:           VersionStatus;
  fail_reason:      string | null;
  created_at:       Date;
}

export interface SourceFragmentRow {
  id:         string;
  version_id: string;
  tenant_id:  string;
  ordinal:    number;
  page:       number | null;
  text:       string;
  char_start: number;
  char_end:   number;
  hash:       string;
  created_at: Date;
}

export interface EvidenceItemRow {
  id:          string;
  version_id:  string;
  fragment_id: string;
  tenant_id:   string;
  kind:        string;
  text:        string;
  created_at:  Date;
}

// ============================================================
// Sources
// ============================================================

/**
 * Insert a new source row.
 * Tenant context must already be set on the client.
 */
export async function insertSource(
  client: pg.PoolClient,
  params: {
    tenantId:  string;
    projectId: string;
    name:      string;
    mimeType:  string;
  },
): Promise<SourceRow> {
  const res = await client.query<SourceRow>(
    `INSERT INTO sources (tenant_id, project_id, name, mime_type)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.tenantId, params.projectId, params.name, params.mimeType],
  );
  return res.rows[0]!;
}

/**
 * Retrieve a source by id within the current tenant context.
 * Returns null when not found (RLS excluded or missing).
 */
export async function getSource(
  client: pg.PoolClient,
  sourceId: string,
): Promise<SourceRow | null> {
  const res = await client.query<SourceRow>(
    "SELECT * FROM sources WHERE id = $1",
    [sourceId],
  );
  return res.rows[0] ?? null;
}

// ============================================================
// Source versions
// ============================================================

/**
 * Insert a source_version row.
 *
 * Idempotency: if (source_id, idempotency_key) already exists, this function
 * returns the existing row (deduplicated = true) without inserting a new one.
 *
 * Content deduplication: if (source_id, sha256) already exists with a DIFFERENT
 * idempotency_key, the DB UNIQUE constraint will raise an error — callers must
 * treat that as a duplicate-content rejection.
 */
export async function upsertSourceVersion(
  client: pg.PoolClient,
  params: {
    sourceId:       string;
    tenantId:       string;
    sha256:         string;
    sizeBytes:      number;
    storagePath:    string;
    idempotencyKey: string;
  },
): Promise<{ row: SourceVersionRow; deduplicated: boolean }> {
  // First check if the idempotency key already exists for this source
  const existing = await client.query<SourceVersionRow>(
    "SELECT * FROM source_versions WHERE source_id = $1 AND idempotency_key = $2",
    [params.sourceId, params.idempotencyKey],
  );
  if (existing.rows.length > 0) {
    return { row: existing.rows[0]!, deduplicated: true };
  }

  const res = await client.query<SourceVersionRow>(
    `INSERT INTO source_versions
       (source_id, tenant_id, sha256, size_bytes, storage_path, idempotency_key, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'INGESTED')
     RETURNING *`,
    [
      params.sourceId,
      params.tenantId,
      params.sha256,
      params.sizeBytes,
      params.storagePath,
      params.idempotencyKey,
    ],
  );
  return { row: res.rows[0]!, deduplicated: false };
}

/**
 * Update the extraction status (and optional fail_reason) of a source version.
 * Allowed transitions:
 *   INGESTED -> EXTRACTED
 *   INGESTED -> FAILED_TERMINAL
 */
export async function setVersionStatus(
  client: pg.PoolClient,
  versionId: string,
  status: "EXTRACTED" | "FAILED_TERMINAL",
  failReason?: string,
): Promise<void> {
  await client.query(
    `UPDATE source_versions
     SET status = $1, fail_reason = $2
     WHERE id = $3`,
    [status, failReason ?? null, versionId],
  );
}

/**
 * Retrieve a source_version by id within the current tenant context.
 */
export async function getSourceVersion(
  client: pg.PoolClient,
  versionId: string,
): Promise<SourceVersionRow | null> {
  const res = await client.query<SourceVersionRow>(
    "SELECT * FROM source_versions WHERE id = $1",
    [versionId],
  );
  return res.rows[0] ?? null;
}

/**
 * Get the latest source_version for a given source.
 */
export async function getLatestSourceVersion(
  client: pg.PoolClient,
  sourceId: string,
): Promise<SourceVersionRow | null> {
  const res = await client.query<SourceVersionRow>(
    "SELECT * FROM source_versions WHERE source_id = $1 ORDER BY created_at DESC LIMIT 1",
    [sourceId],
  );
  return res.rows[0] ?? null;
}

// ============================================================
// Source fragments
// ============================================================

/**
 * Bulk-insert fragments for a source version.
 * Returns the inserted rows.
 */
export async function insertSourceFragments(
  client: pg.PoolClient,
  versionId: string,
  tenantId: string,
  fragments: TextFragment[],
): Promise<SourceFragmentRow[]> {
  if (fragments.length === 0) return [];

  const rows: SourceFragmentRow[] = [];
  for (const frag of fragments) {
    const res = await client.query<SourceFragmentRow>(
      `INSERT INTO source_fragments
         (version_id, tenant_id, ordinal, page, text, char_start, char_end, hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        versionId,
        tenantId,
        frag.ordinal,
        frag.page,
        frag.text,
        frag.charStart,
        frag.charEnd,
        frag.hash,
      ],
    );
    rows.push(res.rows[0]!);
  }
  return rows;
}

/**
 * Get all fragments for a source version, ordered by ordinal.
 */
export async function getSourceFragments(
  client: pg.PoolClient,
  versionId: string,
): Promise<SourceFragmentRow[]> {
  const res = await client.query<SourceFragmentRow>(
    "SELECT * FROM source_fragments WHERE version_id = $1 ORDER BY ordinal ASC",
    [versionId],
  );
  return res.rows;
}

// ============================================================
// Evidence items
// ============================================================

/**
 * Insert an evidence item linked to a fragment.
 */
export async function insertEvidenceItem(
  client: pg.PoolClient,
  params: {
    versionId:  string;
    fragmentId: string;
    tenantId:   string;
    kind:       string;
    text:       string;
  },
): Promise<EvidenceItemRow> {
  const res = await client.query<EvidenceItemRow>(
    `INSERT INTO evidence_items (version_id, fragment_id, tenant_id, kind, text)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [params.versionId, params.fragmentId, params.tenantId, params.kind, params.text],
  );
  return res.rows[0]!;
}
