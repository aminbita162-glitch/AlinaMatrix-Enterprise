/**
 * Domain logic for claim atoms and provenance.
 *
 * Covers:
 *   - Claim support-status invariant (negative_evidence_note required)
 *   - Quote-lock: witnessed quote must be an exact fragment substring with matching hash
 *   - Numeric reconciliation: unit mismatch detection (no auto-correct)
 *   - Terminology uniqueness guard
 *   - Claim graph traversal (SUPPORTS / CONTRADICTS / DERIVED_FROM) — no graph DB
 *
 * Status: Enterprise Candidate — Active Development
 */
import { computeSha256String } from "./source.js";

// ============================================================
// Types
// ============================================================

export type ClaimType = "witnessed" | "inferred" | "assumption";

export type SupportStatus =
  | "supported"
  | "weak"
  | "unsupported"
  | "conflicting"
  | "not_applicable";

export type ContradictionStatus = "none" | "flagged" | "resolved";

export type ReviewerStatus = "pending" | "accepted" | "rejected";

export type CitationStatus =
  | "discovered"
  | "retrieved"
  | "parsed"
  | "supports_claim"
  | "conflicts_with_claim"
  | "unverified";

export type EdgeType = "SUPPORTS" | "CONTRADICTS" | "DERIVED_FROM";

/**
 * Parameters required when creating a new claim atom.
 * negative_evidence_note is validated by assertNegativeEvidenceNote before persist.
 */
export interface ClaimInput {
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
}

/**
 * Input for a citation that may carry a witnessed quote.
 */
export interface CitationInput {
  claimId:     string;
  evidenceId:  string;
  fragmentId?: string | null;
  status:      CitationStatus;
  /** Verbatim quote from the fragment, used for witnessed claims. */
  quote?:      string | null;
  /** SHA-256 of the quote, supplied by the caller and verified by quote-lock. */
  quoteHash?:  string | null;
}

/**
 * A claim edge in the provenance graph.
 */
export interface ClaimEdge {
  sourceClaimId: string;
  targetClaimId: string;
  edgeType:      EdgeType;
}

// ============================================================
// Errors
// ============================================================

/**
 * Thrown when a witnessed claim's quote is not an exact substring of
 * the fragment text, or when the supplied hash does not match the quote.
 */
export class QuoteLockError extends Error {
  constructor(reason: string) {
    super(`Quote-lock validation failed: ${reason}`);
    this.name = "QuoteLockError";
  }
}

/**
 * Thrown when a claim with support_status 'supported' or 'inferred'
 * does not supply a negative_evidence_note.
 */
export class MissingNegativeEvidenceError extends Error {
  constructor(supportStatus: SupportStatus) {
    super(
      `negative_evidence_note is required when support_status is "${supportStatus}". ` +
      "Supply a note explaining why no negative evidence was found or how it was addressed.",
    );
    this.name = "MissingNegativeEvidenceError";
  }
}

/**
 * Thrown when a terminology term already exists in the project.
 * Used as the domain-layer guard before the DB UNIQUE constraint fires.
 */
export class TerminologyDuplicateError extends Error {
  constructor(term: string, projectId: string) {
    super(
      `Term "${term}" already exists in project ${projectId}. ` +
      "Update the existing entry or choose a different term.",
    );
    this.name = "TerminologyDuplicateError";
  }
}

/**
 * Carries information about a unit mismatch between two claims.
 * Not thrown — the caller receives the flag and records it without auto-correcting.
 */
export interface UnitMismatchFlag {
  unitMismatch:    true;
  claimAId:        string;
  claimBId:        string;
  unitA:           string;
  unitB:           string;
  subject:         string;
  predicate:       string;
}

// ============================================================
// Support-status invariant
// ============================================================

/**
 * Assert that a claim with the given support_status supplies a
 * negative_evidence_note when required.
 *
 * The directive requires: "negative_evidence_note required when supported or inferred".
 * A missing or blank note for those statuses is rejected.
 */
export function assertNegativeEvidenceNote(input: ClaimInput): void {
  // Directive: "negative_evidence_note required when supported or inferred"
  // "supported" refers to support_status; "inferred" refers to claim_type.
  const requiresNote =
    input.supportStatus === "supported" || input.claimType === "inferred";
  if (requiresNote) {
    if (!input.negativeEvidenceNote || input.negativeEvidenceNote.trim().length === 0) {
      throw new MissingNegativeEvidenceError(input.supportStatus);
    }
  }
}

// ============================================================
// Quote-lock
// ============================================================

/**
 * Validate a witnessed citation's quote against the source fragment text.
 *
 * Rules:
 * 1. The quote must be a non-empty string.
 * 2. The quote must appear as an exact substring of fragmentText.
 * 3. The supplied quoteHash must equal SHA-256 of the quote (UTF-8).
 *
 * Throws QuoteLockError on any violation.
 * No-op when claimType is not 'witnessed' or when quote is absent.
 */
export function assertQuoteLock(
  claimType:    ClaimType,
  fragmentText: string,
  quote:        string | null | undefined,
  quoteHash:    string | null | undefined,
): void {
  if (claimType !== "witnessed") return;

  if (!quote || quote.trim().length === 0) {
    throw new QuoteLockError(
      "claim_type is 'witnessed' but no quote was supplied.",
    );
  }

  if (!fragmentText.includes(quote)) {
    throw new QuoteLockError(
      `The supplied quote is not an exact substring of the fragment text. ` +
      `Quote length: ${quote.length}, fragment length: ${fragmentText.length}.`,
    );
  }

  const expectedHash = computeSha256String(quote);
  if (!quoteHash || quoteHash !== expectedHash) {
    throw new QuoteLockError(
      `Quote hash mismatch. ` +
      `Expected SHA-256 of quote: "${expectedHash}", received: "${quoteHash ?? "(none)"}".`,
    );
  }
}

/**
 * Compute the expected quote hash for a verbatim quote string.
 * Callers can use this to pre-populate the quoteHash field.
 */
export function computeQuoteHash(quote: string): string {
  return computeSha256String(quote);
}

// ============================================================
// Numeric reconciliation
// ============================================================

/**
 * Compare two claims that share the same subject + predicate but different units.
 * Returns a UnitMismatchFlag when a mismatch is detected, null otherwise.
 *
 * Auto-correction is explicitly prohibited by the directive.
 * The caller is responsible for recording the flag.
 */
export function detectUnitMismatch(
  claimA: { id: string; subject: string; predicate: string; unit: string | null | undefined },
  claimB: { id: string; subject: string; predicate: string; unit: string | null | undefined },
): UnitMismatchFlag | null {
  // Only compare when both claims share the same subject and predicate
  if (claimA.subject !== claimB.subject || claimA.predicate !== claimB.predicate) {
    return null;
  }

  // Both must have a non-null unit to compare
  if (!claimA.unit || !claimB.unit) return null;

  if (claimA.unit !== claimB.unit) {
    return {
      unitMismatch: true,
      claimAId:     claimA.id,
      claimBId:     claimB.id,
      unitA:        claimA.unit,
      unitB:        claimB.unit,
      subject:      claimA.subject,
      predicate:    claimA.predicate,
    };
  }

  return null;
}

// ============================================================
// Claim graph
// ============================================================

export type ClaimAdjacency = Map<string, { edgeType: EdgeType; targetClaimId: string }[]>;

/**
 * Build an in-memory adjacency map from a flat list of claim edges.
 * Keys are source claim IDs; values are arrays of outbound edges.
 */
export function buildClaimGraph(edges: ClaimEdge[]): ClaimAdjacency {
  const adj: ClaimAdjacency = new Map();
  for (const edge of edges) {
    const list = adj.get(edge.sourceClaimId) ?? [];
    list.push({ edgeType: edge.edgeType, targetClaimId: edge.targetClaimId });
    adj.set(edge.sourceClaimId, list);
  }
  return adj;
}

/**
 * Traverse from a given claim ID using BFS over an adjacency map.
 * Returns all reachable claim IDs (excluding the start node).
 *
 * Used to find all claims that support, contradict, or are derived from
 * a starting claim without a graph database.
 */
export function traverseFrom(startId: string, adj: ClaimAdjacency): string[] {
  const visited = new Set<string>([startId]);
  const queue: string[] = [startId];
  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const outbound = adj.get(current) ?? [];
    for (const edge of outbound) {
      if (!visited.has(edge.targetClaimId)) {
        visited.add(edge.targetClaimId);
        result.push(edge.targetClaimId);
        queue.push(edge.targetClaimId);
      }
    }
  }

  return result;
}
