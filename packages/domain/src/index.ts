export { assertLegalTransition, isLegalTransition, IllegalTransitionError } from "./workflow.js";
export type { WorkflowState } from "./workflow.js";

export {
  MAX_UPLOAD_BYTES,
  ALLOWED_MIME_TYPES,
  EXTENSION_TO_MIME,
  sniffMimeType,
  validateMime,
  validateFileSize,
  computeSha256,
  computeSha256String,
  fragmentText,
  fragmentPagedText,
  MimeMismatchError,
  FileSizeError,
  MimeNotAllowedError,
} from "./source.js";
export type { TextFragment } from "./source.js";

export {
  assertNegativeEvidenceNote,
  assertQuoteLock,
  computeQuoteHash,
  detectUnitMismatch,
  buildClaimGraph,
  traverseFrom,
  QuoteLockError,
  MissingNegativeEvidenceError,
  TerminologyDuplicateError,
} from "./claims.js";
export type {
  ClaimType,
  SupportStatus,
  ContradictionStatus,
  ReviewerStatus,
  CitationStatus,
  EdgeType,
  ClaimInput,
  CitationInput,
  ClaimEdge,
  ClaimAdjacency,
  UnitMismatchFlag,
} from "./claims.js";

export {
  AGENT_CAPABILITIES,
  fakeProvider,
  DeterministicFakeProvider,
  assertAgentCapability,
  assertJobNotCancelled,
  buildCacheKey,
  CapabilityDeniedError,
  CancelledJobError,
} from "./agents.js";
export type {
  AgentCapability,
  AgentName,
  CacheKeyParams,
  FakeProviderInput,
  FakeProviderOutput,
} from "./agents.js";

export {
  runArchitectPlan,
  assertArchitectCannotRelease,
} from "./architect.js";
export type {
  ArchitectPlanInput,
  ArchitectPlanVersionPins,
  ArchitectPlanResult,
} from "./architect.js";

export {
  runGenerate,
  assertClaimIdsExist,
  UnknownClaimError,
} from "./generate.js";
export type {
  GenerateInput,
  GenerateResult,
} from "./generate.js";

export {
  runGuard,
  guardResultToTransition,
} from "./guard.js";
export type {
  GuardInput,
  GuardResult,
  GuardFinding,
  GuardClaimInput,
  GuardCitationInput,
  GuardFindingLevel,
  GuardFindingRule,
} from "./guard.js";

export {
  approveClaim,
  rejectClaim,
  canCompleteReview,
  assertNoRejectedClaims,
  assertFourEyes,
  FourEyesError,
  RejectedClaimError,
} from "./review.js";
export type {
  ClaimReviewerStatus,
  ClaimDecisionInput,
  ClaimDecisionResult,
  ReviewClaimInput,
  ApproverRecord,
} from "./review.js";

// Phase 9 — release gate and label lifecycle
export {
  ReleaseGateError,
  IllegalLabelError,
  checkReleaseGate,
  assertReleaseGate,
  isLegalLabelTransition,
  assertLegalLabelTransition,
} from "./release.js";
export type {
  ReleaseLabel,
} from "./release.js";

// Phase 9 — export bundle and permission
export {
  ExportPermissionError,
  WatermarkIntactError,
  assertExportPermission,
  buildExportBundle,
  isWatermarkIntact,
} from "./export.js";
export type {
  ExportPermissionInput,
  ExportBundleInput,
  ExportBundleResult,
} from "./export.js";

// Phase 9 — budget breaker
export {
  checkBudget,
  BudgetBreaker,
} from "./budget.js";

// Phase 9 — revocation
export {
  revokeRelease,
  RevocationInputError,
} from "./revocation.js";
export type {
  RevokeReleaseInput,
} from "./revocation.js";

// Phase D — provenance ledger
export {
  computeLeafHash,
  computeManifestSha256,
  computeMerkleRoot,
  buildProvenanceLedgerEntry,
  verifyProvenanceLedger,
  ProvenanceLedgerError,
} from "./provenance.js";
export type {
  BuildProvenanceLedgerEntryInput,
} from "./provenance.js";

// Phase D — artifact time-travel diff
export {
  diffArtifacts,
} from "./timetravel.js";
export type {
  BuildSnapshot,
  DiffResult,
  DiffEntry,
  DiffField,
  DiffKind,
} from "./timetravel.js";

// Phase D — code-to-document trace
export {
  buildTraceRecord,
  findTrace,
  assertTraceExists,
  MissingTraceError,
  TraceInputError,
} from "./trace.js";
export type {
  BuildTraceRecordInput,
} from "./trace.js";

// Phase E — schema-driven M03 template
export {
  M03_DEFAULT_TEMPLATE,
  M03_SCHEMA_KEYS,
  resolveTemplateKeys,
  assertTemplateKeyKnown,
  filterContentByTemplate,
  isKeyRenderable,
  UnknownTemplateKeyError,
  TemplateInputError,
} from "./template.js";

// Phase E — multi-party consensus review (with deadline)
export {
  buildConsensusConfig,
  assertNoSelfApproval,
  assertApproverAuthorized,
  recordConsensusDecision,
  checkConsensusDeadline,
  assertConsensusWithinDeadline,
  evaluateConsensus,
  assertConsensusApproved,
  SelfApprovalError,
  UnknownApproverError,
  ConsensusNotApprovedError,
  ConsensusRejectedError,
  ConsensusExpiredError,
  ConsensusInputError,
} from "./consensus.js";
export type {
  ConsensusDeadlineResult,
} from "./consensus.js";

// Phase E — reviewer diff between two builds
export {
  buildReviewerDiff,
  ReviewerDiffInputError,
} from "./reviewer-diff.js";
export type {
  BuildReviewerDiffInput,
} from "./reviewer-diff.js";

// Level Up Phase D — assumption register (evidence depth)
export {
  AssumptionRegisterError,
  assertAssumptionRegistered,
  assertAllAssumptionsRegistered,
  checkAssumptionExpiry,
  assertAssumptionNotExpired,
  filterExpiredAssumptions,
} from "./assumption-register.js";

// Level Up Phase D — quote-lock release gate (evidence depth)
export {
  QuoteLockReleaseError,
  checkQuoteLockReleaseGate,
  assertQuoteLockReleaseGate,
} from "./quote-lock-release.js";
export type {
  QuoteLockClaimRef,
  QuoteLockReleaseResult,
} from "./quote-lock-release.js";

// Level Up Phase D — numeric reconciliation (evidence depth)
export {
  NumericReconciliationError,
  reconcileNumber,
  reconcileNumbers,
  discrepanciesOnly,
  assertAllNumbersReconcile,
} from "./numeric-reconciliation.js";
export type {
  NumericPair,
  NumericReconciliationRecord,
} from "./numeric-reconciliation.js";

// Level Up Phase D — negative evidence recording (evidence depth)
export {
  NegativeEvidenceRecordError,
  recordNegativeEvidence,
  assertNegativeEvidenceRecorded,
  buildAbsenceNote,
  recordFragmentAbsence,
  absencesForSource,
} from "./negative-evidence.js";
export type {
  NegativeEvidenceKind,
  NegativeEvidenceRecord,
} from "./negative-evidence.js";

// R3 — live model provider (real call)
export {
  LiveModelProvider,
  recordLiveSemanticVariance,
} from "./live-model.js";

// R3 — pinned live model provider
export {
  PinnedModelProvider,
  recordSemanticVariance,
} from "./pinned-model.js";

// ECIDR — Context Contract V1 (evidence context integrity & deterministic replay)
export {
  CANONICALIZATION_VERSION,
  canonicalizeSourceRefs,
  computeContextPayloadSha256,
  computeSnapshotSha256,
  assertContextAuthorized,
  assertContextAuthorizedDeep,
  sealSnapshot,
  consumeSnapshot,
  rejectSnapshot,
  replaySnapshot,
  replaySnapshotWithEvidence,
  assertLegalSnapshotTransition,
  isLegalSnapshotTransition,
  ContextContractError,
  ContextHashMismatchError,
  ContextAuthorizationError,
  ContextStateError,
  ContextReplayError,
} from "./context.js";
export type {
  SealSnapshotInput,
  AuthorizationEvidence,
  ReplayEvidence,
} from "./context.js";
export type { ContextRejectReason } from "@alinamatrix/contracts";
