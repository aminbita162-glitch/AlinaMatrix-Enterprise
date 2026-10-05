/**
 * Workflow states for AlinaMatrix Enterprise M03 pipeline.
 * Illegal transitions are rejected at the domain boundary.
 *
 * Status: Enterprise Candidate — Active Development
 */

export type WorkflowState =
  | "INGESTED"
  | "CLASSIFIED"
  | "EXTRACTED"
  | "EVIDENCE_READY"
  | "ARCHITECTED"
  | "GENERATED"
  | "VALIDATING"
  | "NEEDS_REVIEW"
  | "APPROVED"
  | "BUILDING"
  | "BUILT"
  | "RELEASED"
  | "FAILED_RETRYABLE"
  | "FAILED_TERMINAL"
  | "CANCELLED"
  | "EXPIRED"
  | "QUARANTINED";

/**
 * Allowed forward transitions.
 * The map key is the current state; values are reachable next states.
 * Terminal and error states have no outbound transitions from here —
 * re-entry into the main flow requires explicit human intervention outside this map.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<WorkflowState, readonly WorkflowState[]>> = {
  INGESTED: ["CLASSIFIED", "FAILED_RETRYABLE", "FAILED_TERMINAL", "QUARANTINED"],
  CLASSIFIED: ["EXTRACTED", "FAILED_RETRYABLE", "FAILED_TERMINAL", "QUARANTINED"],
  EXTRACTED: ["EVIDENCE_READY", "FAILED_RETRYABLE", "FAILED_TERMINAL"],
  EVIDENCE_READY: ["ARCHITECTED", "FAILED_RETRYABLE"],
  ARCHITECTED: ["GENERATED", "FAILED_RETRYABLE"],
  GENERATED: ["VALIDATING", "FAILED_RETRYABLE"],
  VALIDATING: ["NEEDS_REVIEW", "APPROVED", "FAILED_RETRYABLE"],
  NEEDS_REVIEW: ["APPROVED", "CANCELLED"],
  APPROVED: ["BUILDING"],
  BUILDING: ["BUILT", "FAILED_RETRYABLE", "FAILED_TERMINAL"],
  BUILT: ["RELEASED"],
  RELEASED: ["ARCHIVED", "REVOKED"] as unknown as WorkflowState[],
  FAILED_RETRYABLE: ["INGESTED", "CANCELLED"],
  FAILED_TERMINAL: [],
  CANCELLED: [],
  EXPIRED: [],
  QUARANTINED: [],
  // ARCHIVED / REVOKED are handled by the release module; not in base WorkflowState here.
} as const;

export class IllegalTransitionError extends Error {
  constructor(from: WorkflowState, to: WorkflowState) {
    super(`Illegal workflow transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

/**
 * Assert that transitioning from `from` to `to` is legal.
 * Throws IllegalTransitionError if the transition is not allowed.
 */
export function assertLegalTransition(from: WorkflowState, to: WorkflowState): void {
  const allowed = ALLOWED_TRANSITIONS[from] as readonly string[];
  if (!allowed.includes(to)) {
    throw new IllegalTransitionError(from, to);
  }
}

/**
 * Return true if the transition is legal, false otherwise.
 */
export function isLegalTransition(from: WorkflowState, to: WorkflowState): boolean {
  return (ALLOWED_TRANSITIONS[from] as readonly string[]).includes(to);
}
