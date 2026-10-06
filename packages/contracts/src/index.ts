/**
 * packages/contracts — public API
 * Status: Enterprise Candidate — Active Development
 */

export {
  LoginRequestSchema,
  LoginResponseSchema,
  SessionSchema,
  TenantSchema,
  ApiErrorSchema,
} from "./auth.js";

export type {
  LoginRequest,
  LoginResponse,
  Session,
  Tenant,
  ApiError,
} from "./auth.js";

export {
  ALLOWED_MIME_TYPES,
  AllowedMimeTypeSchema,
  UploadSourceRequestSchema,
  SourceVersionResponseSchema,
  UploadSourceResponseSchema,
  SourceResponseSchema,
  SourceFragmentResponseSchema,
} from "./sources.js";

export type {
  AllowedMimeType,
  UploadSourceRequest,
  SourceVersionResponse,
  UploadSourceResponse,
  SourceResponse,
  SourceFragmentResponse,
} from "./sources.js";

export {
  ClaimTypeSchema,
  SupportStatusSchema,
  ContradictionStatusSchema,
  ReviewerStatusSchema,
  CitationStatusSchema,
  EdgeTypeSchema,
  CreateClaimRequestSchema,
  ClaimResponseSchema,
  CreateCitationRequestSchema,
  CitationResponseSchema,
  CreateAssumptionRequestSchema,
  AssumptionResponseSchema,
  CreateTerminologyEntryRequestSchema,
  TerminologyEntryResponseSchema,
  CreateClaimEdgeRequestSchema,
  ClaimEdgeResponseSchema,
} from "./claims.js";

export type {
  ClaimType,
  SupportStatus,
  ContradictionStatus,
  ReviewerStatus,
  CitationStatus,
  EdgeType,
  CreateClaimRequest,
  ClaimResponse,
  CreateCitationRequest,
  CitationResponse,
  CreateAssumptionRequest,
  AssumptionResponse,
  CreateTerminologyEntryRequest,
  TerminologyEntryResponse,
  CreateClaimEdgeRequest,
  ClaimEdgeResponse,
} from "./claims.js";
