/**
 * AlinaGuard domain logic — Phase 6.
 *
 * runGuard: deterministic validation of a generated M03 draft.
 *
 * Guard rules (all deterministic — no LLM):
 *   1. schema         — output must validate against the M03 content model Zod schema.
 *   2. quote-lock     — all witnessed citations re-verified (assertQuoteLock).
 *   3. unsupported    — any claim with support_status="unsupported" blocks APPROVED;
 *                       forces NEEDS_REVIEW.
 *   4. contradiction  — any claim with contradiction_status="flagged" forces NEEDS_REVIEW.
 *   5. neg-evidence   — claim with support_status "supported" or claim_type "inferred"
 *                       without negative_evidence_note fails (hard fail → NEEDS_REVIEW).
 *   6. terminology    — any term used in the draft's terminology section that is not
 *                       present in the project's registered terms fails → NEEDS_REVIEW.
 *
 * guardResultToTransition:
 *   - All rules pass and no blocks  → "APPROVED"  (skips VALIDATING in the fast path).
 *   - Any soft block (unsupported, contradiction, neg-evidence, terminology) → "NEEDS_REVIEW".
 *   - Schema or quote-lock hard fail → "NEEDS_REVIEW" (also records an error finding).
 *
 * Directive:
 *   AlinaGuard holds READ_EVIDENCE + RUN_VALIDATION.
 *   Workflow may reach GENERATED, VALIDATING, NEEDS_REVIEW.  Not RELEASED.
 *
 * Status: Enterprise Candidate — Active Development
 */
import {
  assertAgentCapability,
} from "./agents.js";
import {
  assertNegativeEvidenceNote,
  assertQuoteLock,
  type ClaimType,
  type SupportStatus,
} from "./claims.js";
import { M03ContentModelSchema } from "@alinamatrix/contracts";
import type { M03ContentModel } from "@alinamatrix/contracts";

// ============================================================
// Types
// ============================================================

export type GuardFindingLevel = "error" | "warning" | "info";
export type GuardFindingRule =
  | "schema"
  | "quote-lock"
  | "unsupported"
  | "contradiction"
  | "neg-evidence"
  | "terminology";

export interface GuardFinding {
  rule:    GuardFindingRule;
  level:   GuardFindingLevel;
  message: string;
  /** Claim ID or section key affected, if applicable. */
  ref?:    string;
}

export interface GuardResult {
  /** True if all hard rules passed (schema and quote-lock). */
  hardPassed:      boolean;
  /** True if no soft blocks exist (unsupported, contradiction, neg-evidence, terminology). */
  softPassed:      boolean;
  /** All findings accumulated during validation. */
  findings:        GuardFinding[];
  /** Counts per rule. */
  counts: {
    schemaErrors:       number;
    quoteLockErrors:    number;
    unsupportedBlocks:  number;
    contradictions:     number;
    negEvidenceErrors:  number;
    terminologyDrifts:  number;
  };
}

/** A claim as understood by the guard (fields drawn from the project's claim store). */
export interface GuardClaimInput {
  id:                   string;
  claimType:            ClaimType;
  supportStatus:        SupportStatus;
  contradictionStatus:  "none" | "flagged" | "resolved";
  negativeEvidenceNote: string | null | undefined;
}

/** A citation as understood by the guard. */
export interface GuardCitationInput {
  claimId:      string;
  fragmentText: string;
  claimType:    ClaimType;
  quote:        string | null | undefined;
  quoteHash:    string | null | undefined;
}

/** The full input to runGuard. */
export interface GuardInput {
  /** Raw parsed JSON of the generated draft (will be validated with M03ContentModelSchema). */
  draftJson:         unknown;
  /** Claim objects for every claim referenced in the draft. */
  claims:            GuardClaimInput[];
  /** Citation objects for every citation associated with referenced claims. */
  citations:         GuardCitationInput[];
  /**
   * The set of term strings registered in the project's terminology table.
   * Any term in the draft's terminology section must appear here.
   */
  registeredTerms:   ReadonlySet<string>;
}

// ============================================================
// Guard runner
// ============================================================

/**
 * Run all deterministic guard rules against a generated M03 draft.
 *
 * Capability checked: AlinaGuard must hold RUN_VALIDATION.
 *
 * @throws CapabilityDeniedError if AlinaGuard does not hold RUN_VALIDATION.
 */
export function runGuard(input: GuardInput): GuardResult {
  // Capability check
  assertAgentCapability("AlinaGuard", "RUN_VALIDATION");

  const findings: GuardFinding[] = [];
  let schemaErrors       = 0;
  let quoteLockErrors    = 0;
  let unsupportedBlocks  = 0;
  let contradictions     = 0;
  let negEvidenceErrors  = 0;
  let terminologyDrifts  = 0;

  let contentModel: M03ContentModel | null = null;

  // ----------------------------------------------------------------
  // Rule 1: Schema validation
  // ----------------------------------------------------------------
  const parseResult = M03ContentModelSchema.safeParse(input.draftJson);
  if (!parseResult.success) {
    schemaErrors++;
    for (const issue of parseResult.error.issues) {
      findings.push({
        rule:    "schema",
        level:   "error",
        message: `Schema validation failed at ${issue.path.join(".")}: ${issue.message}`,
      });
    }
  } else {
    contentModel = parseResult.data;
  }

  // ----------------------------------------------------------------
  // Rule 2: Quote-lock re-verification
  // ----------------------------------------------------------------
  for (const cit of input.citations) {
    if (cit.claimType !== "witnessed") continue;
    try {
      assertQuoteLock(cit.claimType, cit.fragmentText, cit.quote, cit.quoteHash);
    } catch (err) {
      quoteLockErrors++;
      findings.push({
        rule:    "quote-lock",
        level:   "error",
        message: (err as Error).message,
        ref:     cit.claimId,
      });
    }
  }

  // ----------------------------------------------------------------
  // Rule 3: Unsupported claims block APPROVED
  // ----------------------------------------------------------------
  for (const claim of input.claims) {
    if (claim.supportStatus === "unsupported") {
      unsupportedBlocks++;
      findings.push({
        rule:    "unsupported",
        level:   "warning",
        message: `Claim "${claim.id}" has support_status=unsupported — blocks APPROVED, forces NEEDS_REVIEW.`,
        ref:     claim.id,
      });
    }
  }

  // ----------------------------------------------------------------
  // Rule 4: Contradiction forces NEEDS_REVIEW
  // ----------------------------------------------------------------
  for (const claim of input.claims) {
    if (claim.contradictionStatus === "flagged") {
      contradictions++;
      findings.push({
        rule:    "contradiction",
        level:   "warning",
        message: `Claim "${claim.id}" has contradiction_status=flagged — forces NEEDS_REVIEW.`,
        ref:     claim.id,
      });
    }
  }

  // ----------------------------------------------------------------
  // Rule 5: Missing negative evidence
  // ----------------------------------------------------------------
  for (const claim of input.claims) {
    try {
      assertNegativeEvidenceNote({
        subject:              "",
        predicate:            "",
        object:               "",
        claimText:            "",
        claimType:            claim.claimType,
        supportStatus:        claim.supportStatus,
        negativeEvidenceNote: claim.negativeEvidenceNote ?? null,
      });
    } catch (err) {
      negEvidenceErrors++;
      findings.push({
        rule:    "neg-evidence",
        level:   "error",
        message: (err as Error).message,
        ref:     claim.id,
      });
    }
  }

  // ----------------------------------------------------------------
  // Rule 6: Terminology drift
  // ----------------------------------------------------------------
  if (contentModel) {
    for (const entry of contentModel.terminology) {
      if (!input.registeredTerms.has(entry.term)) {
        terminologyDrifts++;
        findings.push({
          rule:    "terminology",
          level:   "error",
          message: `Term "${entry.term}" in draft is not registered in the project terminology.`,
          ref:     entry.term,
        });
      }
    }
  }

  const hardPassed = schemaErrors === 0 && quoteLockErrors === 0;
  const softPassed = unsupportedBlocks === 0 && contradictions === 0
    && negEvidenceErrors === 0 && terminologyDrifts === 0;

  return {
    hardPassed,
    softPassed,
    findings,
    counts: {
      schemaErrors,
      quoteLockErrors,
      unsupportedBlocks,
      contradictions,
      negEvidenceErrors,
      terminologyDrifts,
    },
  };
}

// ============================================================
// Transition mapping
// ============================================================

/**
 * Map a GuardResult to the next WorkflowState.
 *
 * Fast-path transitions (no human review step needed):
 *   hardPassed && softPassed → "APPROVED"
 *
 * Any finding that requires human attention:
 *   → "NEEDS_REVIEW"
 *
 * The VALIDATING state is used by the orchestration layer when the guard
 * is running asynchronously; this function returns the settled state.
 */
export function guardResultToTransition(result: GuardResult): "APPROVED" | "NEEDS_REVIEW" {
  if (result.hardPassed && result.softPassed) return "APPROVED";
  return "NEEDS_REVIEW";
}
