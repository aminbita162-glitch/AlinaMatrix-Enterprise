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

export {
  insertRenderedArtifact,
  getRenderedArtifact,
  getRenderedArtifactByBuild,
  listRenderedArtifactsByRun,
  insertBuildManifest,
  getBuildManifest,
} from "./render.js";
export type {
  RenderedArtifactRow,
  BuildManifestRow,
  InsertRenderedArtifactParams,
  InsertBuildManifestParams,
} from "./render.js";

export {
  insertReviewTask,
  getReviewTask,
  getReviewTaskByRun,
  listReviewTasksByProject,
  listOpenReviewTasks,
  updateReviewTaskState,
  insertApproval,
  getApproval,
  listApprovalsByTask,
  insertComment,
  getComment,
  listCommentsByTask,
} from "./review.js";
export type {
  ReviewTaskRow,
  ApprovalRow,
  CommentRow,
  ReviewTaskState,
  ApprovalDecision,
  InsertReviewTaskParams,
  InsertApprovalParams,
  InsertCommentParams,
} from "./review.js";

// Phase 9 — release labels
export {
  insertReleaseLabel,
  getReleaseLabel,
  getReleaseLabelByArtifact,
  publishReleaseLabel,
  updateReleaseLabel,
} from "./release.js";
export type {
  ReleaseLabel,
  ReleaseLabelRow,
  InsertReleaseLabelParams,
  PublishReleaseLabelParams,
} from "./release.js";

// Phase 9 — export audit (append-only)
export {
  insertExportAudit,
  listExportAuditByArtifact,
} from "./export-audit.js";
export type {
  ExportAuditRow,
  InsertExportAuditParams,
} from "./export-audit.js";

// Phase 9 — project budgets (budget breaker)
export {
  insertProjectBudget,
  getProjectBudget,
  increaseProjectBudgetSpent,
} from "./budget.js";
export type {
  ProjectBudgetRow,
  InsertProjectBudgetParams,
  IncreaseProjectBudgetSpentParams,
} from "./budget.js";

// Phase 9 — revocation events (append-only)
export {
  insertRevocationEvent,
  listRevocationEventsByArtifact,
} from "./revocation.js";
export type {
  RevocationEventRow,
  RevocationPriorLabel,
  InsertRevocationEventParams,
} from "./revocation.js";

// Phase D — provenance ledger (append-only)
export {
  insertProvenanceLedgerEntry,
  listProvenanceLedgerByArtifact,
  getProvenanceLedgerRoot,
} from "./provenance.js";
export type {
  ProvenanceLedgerRow,
  InsertProvenanceLedgerParams,
} from "./provenance.js";

// Phase D — code-to-document trace (append-only)
export {
  insertTrace,
  listTracesByClaim,
  listTracesByArtifact,
  findTraceByPathAndClaim,
} from "./trace.js";
export type {
  TraceRow,
  InsertTraceParams,
} from "./trace.js";

// Phase E — consensus decision events (append-only)
export {
  insertConsensusDecisionEvent,
  listConsensusDecisionEventsByTask,
  countConsensusApprovals,
  countConsensusRejections,
} from "./consensus.js";
export type {
  ConsensusDecisionEventRow,
  InsertConsensusDecisionEventParams,
} from "./consensus.js";
