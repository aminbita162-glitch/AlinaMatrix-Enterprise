/**
 * DB layer for rendered artifacts and build manifests — Phase 8.
 *
 * Tables: rendered_artifacts, build_manifests.
 *
 * Both tables are INSERT-only (immutable after creation):
 *   - rendered_artifacts has UNIQUE (workflow_run_id, build_id)
 *   - build_manifests   has UNIQUE (rendered_artifact_id)
 * Triggers reject UPDATE and DELETE; GRANT excludes UPDATE and DELETE.
 *
 * Directive Phase 8:
 *   "Published row content update rejected by trigger."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { v4 as uuidv4 } from "uuid";
import type { DbClient } from "./client.js";

// ============================================================
// Row types
// ============================================================

export interface RenderedArtifactRow {
  id:                  string;
  tenant_id:           string;
  project_id:          string;
  workflow_run_id:     string;
  html:                string;
  html_sha256:        string;
  manifest_json:       Record<string, unknown>;
  content_hash:        string;
  prompt_version_id:   string;
  model_version_id:    string;
  schema_version_id:   string;
  policy_version_id:   string;
  renderer:           string;
  template:           string;
  build_id:            string;
  build_time:          Date;
  created_at:          Date;
}

export interface BuildManifestRow {
  id:                     string;
  tenant_id:              string;
  rendered_artifact_id:   string;
  content_hash:           string;
  source_version_ids:     string[];
  prompt_version_id:      string;
  model_version_id:       string;
  schema_version_id:      string;
  policy_version_id:      string;
  renderer:               string;
  template:               string;
  build_id:               string;
  build_time:             Date;
  html_sha256:           string;
  created_at:            Date;
}

// ============================================================
// Insert rendered artifact
// ============================================================

export interface InsertRenderedArtifactParams {
  tenantId:          string;
  projectId:         string;
  workflowRunId:     string;
  html:              string;
  htmlSha256:        string;
  manifestJson:      Record<string, unknown>;
  contentHash:       string;
  promptVersionId:  string;
  modelVersionId:    string;
  schemaVersionId:   string;
  policyVersionId:  string;
  renderer:          string;
  template:          string;
  buildId:           string;
  buildTime:         Date;
}

export async function insertRenderedArtifact(
  client: DbClient,
  params: InsertRenderedArtifactParams,
): Promise<RenderedArtifactRow> {
  const id = uuidv4();
  const res = await client.query<RenderedArtifactRow>(
    `INSERT INTO rendered_artifacts
       (id, tenant_id, project_id, workflow_run_id,
        html, html_sha256, manifest_json, content_hash,
        prompt_version_id, model_version_id, schema_version_id, policy_version_id,
        renderer, template, build_id, build_time)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (workflow_run_id, build_id) DO NOTHING
     RETURNING *`,
    [
      id,
      params.tenantId,
      params.projectId,
      params.workflowRunId,
      params.html,
      params.htmlSha256,
      JSON.stringify(params.manifestJson),
      params.contentHash,
      params.promptVersionId,
      params.modelVersionId,
      params.schemaVersionId,
      params.policyVersionId,
      params.renderer,
      params.template,
      params.buildId,
      params.buildTime,
    ],
  );
  if (res.rows.length === 0) {
    return getRenderedArtifactByBuild(client, params.workflowRunId, params.buildId);
  }
  return res.rows[0]!;
}

export async function getRenderedArtifact(
  client: DbClient,
  artifactId: string,
): Promise<RenderedArtifactRow | null> {
  const res = await client.query<RenderedArtifactRow>(
    `SELECT * FROM rendered_artifacts WHERE id = $1`,
    [artifactId],
  );
  return res.rows[0] ?? null;
}

export async function getRenderedArtifactByBuild(
  client: DbClient,
  workflowRunId: string,
  buildId: string,
): Promise<RenderedArtifactRow> {
  const res = await client.query<RenderedArtifactRow>(
    `SELECT * FROM rendered_artifacts WHERE workflow_run_id = $1 AND build_id = $2`,
    [workflowRunId, buildId],
  );
  if (res.rows.length === 0) {
    throw new Error(
      `Rendered artifact not found for workflow_run_id: ${workflowRunId}, build_id: ${buildId}`,
    );
  }
  return res.rows[0]!;
}

export async function listRenderedArtifactsByRun(
  client: DbClient,
  workflowRunId: string,
): Promise<RenderedArtifactRow[]> {
  const res = await client.query<RenderedArtifactRow>(
    `SELECT * FROM rendered_artifacts WHERE workflow_run_id = $1 ORDER BY build_time ASC`,
    [workflowRunId],
  );
  return res.rows;
}

// ============================================================
// Insert build manifest
// ============================================================

export interface InsertBuildManifestParams {
  tenantId:             string;
  renderedArtifactId:   string;
  contentHash:          string;
  sourceVersionIds:     string[];
  promptVersionId:     string;
  modelVersionId:      string;
  schemaVersionId:     string;
  policyVersionId:     string;
  renderer:            string;
  template:            string;
  buildId:             string;
  buildTime:           Date;
  htmlSha256:         string;
}

export async function insertBuildManifest(
  client: DbClient,
  params: InsertBuildManifestParams,
): Promise<BuildManifestRow> {
  const id = uuidv4();
  const res = await client.query<BuildManifestRow>(
    `INSERT INTO build_manifests
       (id, tenant_id, rendered_artifact_id,
        content_hash, source_version_ids,
        prompt_version_id, model_version_id, schema_version_id, policy_version_id,
        renderer, template, build_id, build_time, html_sha256)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (rendered_artifact_id) DO NOTHING
     RETURNING *`,
    [
      id,
      params.tenantId,
      params.renderedArtifactId,
      params.contentHash,
      params.sourceVersionIds,
      params.promptVersionId,
      params.modelVersionId,
      params.schemaVersionId,
      params.policyVersionId,
      params.renderer,
      params.template,
      params.buildId,
      params.buildTime,
      params.htmlSha256,
    ],
  );
  if (res.rows.length === 0) {
    return getBuildManifest(client, params.renderedArtifactId);
  }
  return res.rows[0]!;
}

export async function getBuildManifest(
  client: DbClient,
  renderedArtifactId: string,
): Promise<BuildManifestRow> {
  const res = await client.query<BuildManifestRow>(
    `SELECT * FROM build_manifests WHERE rendered_artifact_id = $1`,
    [renderedArtifactId],
  );
  if (res.rows.length === 0) {
    throw new Error(`Build manifest not found for rendered_artifact_id: ${renderedArtifactId}`);
  }
  return res.rows[0]!;
}
