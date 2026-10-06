/**
 * Database access layer for claims, citations, assumptions,
 * terminology_entries, and claim_edges.
 *
 * All functions receive a pg.PoolClient whose tenant context must already be
 * set by the caller (via setTenantContext / withTenantContext).
 *
 * Status: Enterprise Candidate — Active Development
 */
import type pg from "pg";
import type {
  ClaimType,
  SupportStatus,
  ContradictionStatus,
  ReviewerStatus,
  CitationStatus,
  EdgeType,
} from "@alinamatrix/domain";

// ============================================================
// Row types
// ============================================================

export interface ClaimRow {
  id:                     string;
  tenant_id:              string;
  project_id:             string;
  subject:                string;
  predicate:              string;
  object:                 string;
  qualifier:              string | null;
  time_scope:             string | null;
  unit:                   string | null;
  claim_text:             string;
  claim_type:             ClaimType;
  support_status:         SupportStatus;
  negative_evidence_note: string | null;
  evidence_ids:           string[];
  confidence:             string | null; // pg returns numeric as string
  contradiction_status:   ContradictionStatus;
  generated:              boolean;
  reviewer_status:        ReviewerStatus;
  created_at:             Date;
  updated_at:             Date;
}

export interface CitationRow {
  id:          string;
  tenant_id:   string;
  claim_id:    string;
  evidence_id: string;
  fragment_id: string | null;
  status:      CitationStatus;
  quote:       string | null;
  quote_hash:  string | null;
  created_at:  Date;
}

export interface AssumptionRow {
  id:              string;
  tenant_id:       string;
  project_id:      string;
  claim_id:        string | null;
  statement:       string;
  rationale:       string | null;
  reviewer_status: ReviewerStatus;
  created_at:      Date;
}

export interface TerminologyEntryRow {
  id:         string;
  tenant_id:  string;
  project_id: string;
  term:       string;
  definition: string;
  created_at: Date;
  updated_at: Date;
}

export interface ClaimEdgeRow {
  id:               string;
  tenant_id:        string;
  source_claim_id:  string;
  target_claim_id:  string;
  edge_type:        EdgeType;
  created_at:       Date;
}

// ============================================================
// Claims
// ============================================================

/**
 * Insert a new claim atom.
 * Caller must have already validated via assertNegativeEvidenceNote.
 */
export async function insertClaim(
  client: pg.PoolClient,
  params: {
    tenantId:              string;
    projectId:             string;
    subject:               string;
    predicate:             string;
    object:                string;
    qualifier?:            string | null;
    timeScope?:            string | null;
    unit?:                 string | null;
    claimText:             string;
    claimType:             ClaimType;
    supportStatus:         SupportStatus;
    negativeEvidenceNote?: string | null;
    evidenceIds?:          string[];
    confidence?:           number | null;
    generated?:            boolean;
  },
): Promise<ClaimRow> {
  const res = await client.query<ClaimRow>(
    `INSERT INTO claims
       (tenant_id, project_id, subject, predicate, object, qualifier,
        time_scope, unit, claim_text, claim_type, support_status,
        negative_evidence_note, evidence_ids, confidence, generated)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      params.tenantId,
      params.projectId,
      params.subject,
      params.predicate,
      params.object,
      params.qualifier ?? null,
      params.timeScope ?? null,
      params.unit ?? null,
      params.claimText,
      params.claimType,
      params.supportStatus,
      params.negativeEvidenceNote ?? null,
      params.evidenceIds ?? [],
      params.confidence ?? null,
      params.generated ?? false,
    ],
  );
  return res.rows[0]!;
}

/**
 * Retrieve a claim by id within the current tenant context.
 * Returns null when not found (RLS excluded or missing).
 */
export async function getClaim(
  client: pg.PoolClient,
  claimId: string,
): Promise<ClaimRow | null> {
  const res = await client.query<ClaimRow>(
    "SELECT * FROM claims WHERE id = $1",
    [claimId],
  );
  return res.rows[0] ?? null;
}

/**
 * List all claims for a project, ordered by creation time.
 */
export async function listClaimsByProject(
  client: pg.PoolClient,
  projectId: string,
): Promise<ClaimRow[]> {
  const res = await client.query<ClaimRow>(
    "SELECT * FROM claims WHERE project_id = $1 ORDER BY created_at ASC",
    [projectId],
  );
  return res.rows;
}

/**
 * Update reviewer_status and contradiction_status on a claim.
 */
export async function updateClaimStatus(
  client: pg.PoolClient,
  claimId: string,
  update: {
    reviewerStatus?:     ReviewerStatus;
    contradictionStatus?: ContradictionStatus;
  },
): Promise<void> {
  if (update.reviewerStatus !== undefined) {
    await client.query(
      `UPDATE claims SET reviewer_status = $1, updated_at = now() WHERE id = $2`,
      [update.reviewerStatus, claimId],
    );
  }
  if (update.contradictionStatus !== undefined) {
    await client.query(
      `UPDATE claims SET contradiction_status = $1, updated_at = now() WHERE id = $2`,
      [update.contradictionStatus, claimId],
    );
  }
}

// ============================================================
// Citations
// ============================================================

/**
 * Insert a citation row.
 * Caller must have already performed quote-lock validation via assertQuoteLock.
 */
export async function insertCitation(
  client: pg.PoolClient,
  params: {
    tenantId:   string;
    claimId:    string;
    evidenceId: string;
    fragmentId?: string | null;
    status:     CitationStatus;
    quote?:     string | null;
    quoteHash?: string | null;
  },
): Promise<CitationRow> {
  const res = await client.query<CitationRow>(
    `INSERT INTO citations
       (tenant_id, claim_id, evidence_id, fragment_id, status, quote, quote_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      params.tenantId,
      params.claimId,
      params.evidenceId,
      params.fragmentId ?? null,
      params.status,
      params.quote ?? null,
      params.quoteHash ?? null,
    ],
  );
  return res.rows[0]!;
}

/**
 * Retrieve a citation by id within the current tenant context.
 */
export async function getCitation(
  client: pg.PoolClient,
  citationId: string,
): Promise<CitationRow | null> {
  const res = await client.query<CitationRow>(
    "SELECT * FROM citations WHERE id = $1",
    [citationId],
  );
  return res.rows[0] ?? null;
}

/**
 * List all citations for a claim.
 */
export async function listCitationsByClaim(
  client: pg.PoolClient,
  claimId: string,
): Promise<CitationRow[]> {
  const res = await client.query<CitationRow>(
    "SELECT * FROM citations WHERE claim_id = $1 ORDER BY created_at ASC",
    [claimId],
  );
  return res.rows;
}

// ============================================================
// Assumptions
// ============================================================

/**
 * Insert an assumption row.
 */
export async function insertAssumption(
  client: pg.PoolClient,
  params: {
    tenantId:   string;
    projectId:  string;
    claimId?:   string | null;
    statement:  string;
    rationale?: string | null;
  },
): Promise<AssumptionRow> {
  const res = await client.query<AssumptionRow>(
    `INSERT INTO assumptions (tenant_id, project_id, claim_id, statement, rationale)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [
      params.tenantId,
      params.projectId,
      params.claimId ?? null,
      params.statement,
      params.rationale ?? null,
    ],
  );
  return res.rows[0]!;
}

/**
 * List assumptions for a project, ordered by creation time.
 */
export async function listAssumptions(
  client: pg.PoolClient,
  projectId: string,
): Promise<AssumptionRow[]> {
  const res = await client.query<AssumptionRow>(
    "SELECT * FROM assumptions WHERE project_id = $1 ORDER BY created_at ASC",
    [projectId],
  );
  return res.rows;
}

// ============================================================
// Terminology entries
// ============================================================

/**
 * Insert a terminology entry.
 * Throws on DB UNIQUE constraint violation (project_id, term) if the term already exists.
 * Caller may pre-check with getTerminologyEntry to surface a domain error instead.
 */
export async function insertTerminologyEntry(
  client: pg.PoolClient,
  params: {
    tenantId:   string;
    projectId:  string;
    term:       string;
    definition: string;
  },
): Promise<TerminologyEntryRow> {
  const res = await client.query<TerminologyEntryRow>(
    `INSERT INTO terminology_entries (tenant_id, project_id, term, definition)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [params.tenantId, params.projectId, params.term, params.definition],
  );
  return res.rows[0]!;
}

/**
 * Retrieve a terminology entry by (project_id, term).
 * Returns null when not found.
 */
export async function getTerminologyEntry(
  client: pg.PoolClient,
  projectId: string,
  term: string,
): Promise<TerminologyEntryRow | null> {
  const res = await client.query<TerminologyEntryRow>(
    "SELECT * FROM terminology_entries WHERE project_id = $1 AND term = $2",
    [projectId, term],
  );
  return res.rows[0] ?? null;
}

/**
 * List all terminology entries for a project, alphabetically.
 */
export async function listTerminology(
  client: pg.PoolClient,
  projectId: string,
): Promise<TerminologyEntryRow[]> {
  const res = await client.query<TerminologyEntryRow>(
    "SELECT * FROM terminology_entries WHERE project_id = $1 ORDER BY term ASC",
    [projectId],
  );
  return res.rows;
}

// ============================================================
// Claim edges (provenance graph)
// ============================================================

/**
 * Insert a claim edge.
 * The DB UNIQUE constraint prevents duplicate directed edges of the same type.
 */
export async function insertClaimEdge(
  client: pg.PoolClient,
  params: {
    tenantId:       string;
    sourceClaimId:  string;
    targetClaimId:  string;
    edgeType:       EdgeType;
  },
): Promise<ClaimEdgeRow> {
  const res = await client.query<ClaimEdgeRow>(
    `INSERT INTO claim_edges (tenant_id, source_claim_id, target_claim_id, edge_type)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [params.tenantId, params.sourceClaimId, params.targetClaimId, params.edgeType],
  );
  return res.rows[0]!;
}

/**
 * Get all claim edges where source_claim_id = claimId (outbound from a claim).
 */
export async function getClaimEdges(
  client: pg.PoolClient,
  claimId: string,
): Promise<ClaimEdgeRow[]> {
  const res = await client.query<ClaimEdgeRow>(
    "SELECT * FROM claim_edges WHERE source_claim_id = $1 ORDER BY created_at ASC",
    [claimId],
  );
  return res.rows;
}

/**
 * Get all edges for a project by fetching edges where source or target claims
 * belong to the project. Uses a JOIN to keep this single-query.
 */
export async function getClaimEdgesByProject(
  client: pg.PoolClient,
  projectId: string,
): Promise<ClaimEdgeRow[]> {
  const res = await client.query<ClaimEdgeRow>(
    `SELECT ce.*
     FROM claim_edges ce
     JOIN claims c ON c.id = ce.source_claim_id
     WHERE c.project_id = $1
     ORDER BY ce.created_at ASC`,
    [projectId],
  );
  return res.rows;
}
