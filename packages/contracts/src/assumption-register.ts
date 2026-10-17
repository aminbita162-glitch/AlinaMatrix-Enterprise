/**
 * Assumption register contracts — Level Up Phase D (Unit 1: evidence depth).
 *
 * Each assumption in the register has a source, an owner, and an expiry date.
 * The register is the authority for whether an assumption is still in force:
 * an expired assumption must be re-validated or retired, not silently kept.
 *
 * Directive Level Up Phase D:
 *   "Assumption register: each assumption has source, owner, and expiry."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

const UuidString  = z.string().uuid();
const ShortString = z.string().min(1).max(512);
const IsoDate     = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * A single entry in the assumption register.
 *
 * `source` identifies where the assumption originates (a source version id,
 * a fragment id, or a human-readable citation — never a DOI/PMID/ISBN).
 * `owner` is the person or role responsible for validating or retiring it.
 * `expiry` is the ISO date after which the assumption is no longer trusted.
 */
export const AssumptionRegisterEntrySchema = z.object({
  id:         UuidString,
  projectId:  UuidString,
  statement:  z.string().min(1).max(4096),
  source:     z.string().min(1).max(2048),
  owner:      ShortString,
  expiry:     IsoDate,
  rationale:  z.string().max(4096).nullable().optional(),
});
export type AssumptionRegisterEntry = z.infer<typeof AssumptionRegisterEntrySchema>;

/**
 * Result of checking whether an assumption has expired relative to a
 * reference date. The absence of an expiry is a register violation, not
 * a "no expiry" state — every assumption must have one.
 */
export const AssumptionExpiryResultSchema = z.object({
  assumptionId: UuidString,
  expired:      z.boolean(),
  expiryDate:   IsoDate,
  referenceDate: IsoDate,
});
export type AssumptionExpiryResult = z.infer<typeof AssumptionExpiryResultSchema>;
