/**
 * packages/db — public API
 * Status: Enterprise Candidate — Active Development
 */

export { createPool, withTransaction } from "./client.js";
export type { DbPool, DbClient } from "./client.js";

export { setTenantContext, clearTenantContext, withTenantContext } from "./tenant-context.js";

export { runMigrations } from "./migrate.js";

export {
  insertSource,
  getSource,
  upsertSourceVersion,
  setVersionStatus,
  getSourceVersion,
  getLatestSourceVersion,
  insertSourceFragments,
  getSourceFragments,
  insertEvidenceItem,
} from "./sources.js";
export type {
  SourceRow,
  SourceVersionRow,
  SourceFragmentRow,
  EvidenceItemRow,
  VersionStatus,
} from "./sources.js";

export {
  insertClaim,
  getClaim,
  listClaimsByProject,
  updateClaimStatus,
  insertCitation,
  getCitation,
  listCitationsByClaim,
  insertAssumption,
  listAssumptions,
  insertTerminologyEntry,
  getTerminologyEntry,
  listTerminology,
  insertClaimEdge,
  getClaimEdges,
  getClaimEdgesByProject,
} from "./claims.js";
export type {
  ClaimRow,
  CitationRow,
  AssumptionRow,
  TerminologyEntryRow,
  ClaimEdgeRow,
} from "./claims.js";
