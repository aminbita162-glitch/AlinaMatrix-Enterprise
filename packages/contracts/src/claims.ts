/**
 * Zod schemas for claim atoms, citations, assumptions, and terminology.
 *
 * Design notes:
 * - No DOI, PMID, ISBN, or patent number fields exposed in any schema.
 * - negative_evidence_note is optional here; the application layer enforces
 *   its presence when support_status is 'supported' or 'inferred'.
 * - quote and quote_hash are accepted only when claim_type is 'witnessed';
 *   the domain guard (assertQuoteLock) validates them before persist.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

// ============================================================
// Enumerations
// ============================================================

export const ClaimTypeSchema = z.enum(["witnessed", "inferred", "assumption"]);
export type ClaimType = z.infer<typeof ClaimTypeSchema>;

export const SupportStatusSchema = z.enum([
  "supported", "weak", "unsupported", "conflicting", "not_applicable",
]);
export type SupportStatus = z.infer<typeof SupportStatusSchema>;

export const ContradictionStatusSchema = z.enum(["none", "flagged", "resolved"]);
export type ContradictionStatus = z.infer<typeof ContradictionStatusSchema>;

export const ReviewerStatusSchema = z.enum(["pending", "accepted", "rejected"]);
export type ReviewerStatus = z.infer<typeof ReviewerStatusSchema>;

export const CitationStatusSchema = z.enum([
  "discovered", "retrieved", "parsed",
  "supports_claim", "conflicts_with_claim", "unverified",
]);
export type CitationStatus = z.infer<typeof CitationStatusSchema>;

export const EdgeTypeSchema = z.enum(["SUPPORTS", "CONTRADICTS", "DERIVED_FROM"]);
export type EdgeType = z.infer<typeof EdgeTypeSchema>;

// ============================================================
// Claims
// ============================================================

/** Request schema to create a new claim atom. */
export const CreateClaimRequestSchema = z.object({
  projectId:             z.string().uuid(),
  subject:               z.string().min(1).max(1024),
  predicate:             z.string().min(1).max(512),
  object:                z.string().min(1).max(2048),
  qualifier:             z.string().max(512).nullable().optional(),
  timeScope:             z.string().max(256).nullable().optional(),
  unit:                  z.string().max(128).nullable().optional(),
  claimText:             z.string().min(1).max(4096),
  claimType:             ClaimTypeSchema,
  supportStatus:         SupportStatusSchema,
  negativeEvidenceNote:  z.string().max(4096).nullable().optional(),
  evidenceIds:           z.array(z.string().uuid()).optional(),
  confidence:            z.number().min(0).max(1).nullable().optional(),
  generated:             z.boolean().optional(),
});
export type CreateClaimRequest = z.infer<typeof CreateClaimRequestSchema>;

/** Full claim response. */
export const ClaimResponseSchema = z.object({
  id:                    z.string().uuid(),
  projectId:             z.string().uuid(),
  subject:               z.string(),
  predicate:             z.string(),
  object:                z.string(),
  qualifier:             z.string().nullable(),
  timeScope:             z.string().nullable(),
  unit:                  z.string().nullable(),
  claimText:             z.string(),
  claimType:             ClaimTypeSchema,
  supportStatus:         SupportStatusSchema,
  negativeEvidenceNote:  z.string().nullable(),
  evidenceIds:           z.array(z.string().uuid()),
  confidence:            z.number().nullable(),
  contradictionStatus:   ContradictionStatusSchema,
  generated:             z.boolean(),
  reviewerStatus:        ReviewerStatusSchema,
  createdAt:             z.string().datetime(),
  updatedAt:             z.string().datetime(),
});
export type ClaimResponse = z.infer<typeof ClaimResponseSchema>;

// ============================================================
// Citations
// ============================================================

/**
 * Request schema to create a citation.
 * No DOI / PMID / ISBN / patent number fields.
 */
export const CreateCitationRequestSchema = z.object({
  claimId:     z.string().uuid(),
  evidenceId:  z.string().uuid(),
  fragmentId:  z.string().uuid().nullable().optional(),
  status:      CitationStatusSchema,
  /**
   * Verbatim quote from the fragment (required for witnessed claims).
   * quote-lock validation is performed by the domain layer before persist.
   */
  quote:       z.string().max(8192).nullable().optional(),
  /**
   * SHA-256 hex digest of quote.
   * Must be exactly 64 hex characters when supplied.
   */
  quoteHash:   z.string().length(64).nullable().optional(),
});
export type CreateCitationRequest = z.infer<typeof CreateCitationRequestSchema>;

export const CitationResponseSchema = z.object({
  id:          z.string().uuid(),
  claimId:     z.string().uuid(),
  evidenceId:  z.string().uuid(),
  fragmentId:  z.string().uuid().nullable(),
  status:      CitationStatusSchema,
  quote:       z.string().nullable(),
  quoteHash:   z.string().length(64).nullable(),
  createdAt:   z.string().datetime(),
});
export type CitationResponse = z.infer<typeof CitationResponseSchema>;

// ============================================================
// Assumptions
// ============================================================

export const CreateAssumptionRequestSchema = z.object({
  projectId:   z.string().uuid(),
  claimId:     z.string().uuid().nullable().optional(),
  statement:   z.string().min(1).max(4096),
  rationale:   z.string().max(4096).nullable().optional(),
});
export type CreateAssumptionRequest = z.infer<typeof CreateAssumptionRequestSchema>;

export const AssumptionResponseSchema = z.object({
  id:             z.string().uuid(),
  projectId:      z.string().uuid(),
  claimId:        z.string().uuid().nullable(),
  statement:      z.string(),
  rationale:      z.string().nullable(),
  reviewerStatus: ReviewerStatusSchema,
  createdAt:      z.string().datetime(),
});
export type AssumptionResponse = z.infer<typeof AssumptionResponseSchema>;

// ============================================================
// Terminology
// ============================================================

export const CreateTerminologyEntryRequestSchema = z.object({
  projectId:  z.string().uuid(),
  term:       z.string().min(1).max(512),
  definition: z.string().min(1).max(4096),
});
export type CreateTerminologyEntryRequest = z.infer<typeof CreateTerminologyEntryRequestSchema>;

export const TerminologyEntryResponseSchema = z.object({
  id:         z.string().uuid(),
  projectId:  z.string().uuid(),
  term:       z.string(),
  definition: z.string(),
  createdAt:  z.string().datetime(),
  updatedAt:  z.string().datetime(),
});
export type TerminologyEntryResponse = z.infer<typeof TerminologyEntryResponseSchema>;

// ============================================================
// Claim edges (provenance graph)
// ============================================================

export const CreateClaimEdgeRequestSchema = z.object({
  sourceClaimId: z.string().uuid(),
  targetClaimId: z.string().uuid(),
  edgeType:      EdgeTypeSchema,
});
export type CreateClaimEdgeRequest = z.infer<typeof CreateClaimEdgeRequestSchema>;

export const ClaimEdgeResponseSchema = z.object({
  id:            z.string().uuid(),
  sourceClaimId: z.string().uuid(),
  targetClaimId: z.string().uuid(),
  edgeType:      EdgeTypeSchema,
  createdAt:     z.string().datetime(),
});
export type ClaimEdgeResponse = z.infer<typeof ClaimEdgeResponseSchema>;
