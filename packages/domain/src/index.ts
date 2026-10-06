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
