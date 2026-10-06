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

export {
  getAgent,
  getAgentByName,
  listAgents,
  insertModelVersion,
  getModelVersion,
  insertPromptVersion,
  getPromptVersion,
  insertSchemaVersion,
  getSchemaVersion,
  insertPolicyVersion,
  getPolicyVersion,
  insertAgentVersion,
  getAgentVersion,
  insertWorkflow,
  getWorkflow,
  insertWorkflowRun,
  getWorkflowRun,
  transitionWorkflowRunState,
  insertJob,
  getJob,
  transitionJobState,
  appendJobEvent,
  listJobEvents,
  insertAgentRun,
  completeAgentRun,
  getAgentRun,
  insertUsageEvent,
  listUsageEventsByJob,
  listUsageEventsByProject,
  getCacheEntry,
  insertCacheEntry,
  getOrInsertCacheEntry,
} from "./agents.js";
export type {
  AgentRow,
  ModelVersionRow,
  PromptVersionRow,
  SchemaVersionRow,
  PolicyVersionRow,
  AgentVersionRow,
  WorkflowRow,
  WorkflowRunRow,
  ProcessingJobRow,
  JobEventRow,
  AgentRunRow,
  UsageEventRow,
  CacheEntryRow,
} from "./agents.js";

export {
  insertM03Plan,
  getM03Plan,
  insertM03Draft,
  getM03Draft,
} from "./m03.js";
export type {
  InsertM03PlanParams,
  InsertM03DraftParams,
  M03PlanRow,
  M03DraftRow,
} from "./m03.js";
