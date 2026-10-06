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
