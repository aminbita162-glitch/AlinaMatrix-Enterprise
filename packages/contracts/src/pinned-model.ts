/**
 * Pinned model provider contracts — R3.
 *
 * Zod schemas for the pinned live-model provider:
 *   - PinnedModelConfigSchema    — { modelId, temperature, schemaVersion,
 *                                    budgetCeilingMinorUnits } as bigint.
 *   - SemanticVarianceRecordSchema — records the difference between the
 *                                    DeterministicFakeProvider and the
 *                                    PinnedModelProvider for the same input.
 *
 * Directive R3:
 *   "Add one pinned model provider beside DeterministicFakeProvider.
 *    Pin model id, temperature, schema version, and budget ceiling.
 *    Record semantic variance. Do not call the model if over budget."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

// ============================================================
// Pinned model config — model id, temperature, schema version, budget ceiling
// ============================================================

export const PinnedModelConfigSchema = z.object({
  /** Pinned model identifier (e.g. "pinned-m03-v1"). */
  modelId:                  z.string().min(1).max(256),
  /** Pinned sampling temperature (0–2 inclusive). */
  temperature:              z.number().min(0).max(2),
  /** Pinned schema version string (e.g. "m03-schema-v1"). */
  schemaVersion:            z.string().min(1).max(128),
  /** Budget ceiling in minor units (bigint — exact). */
  budgetCeilingMinorUnits:  z.bigint(),
});
export type PinnedModelConfig = z.infer<typeof PinnedModelConfigSchema>;

// ============================================================
// Semantic variance record — records the difference between providers
// ============================================================

/**
 * Record the semantic variance between DeterministicFakeProvider and
 * a second provider (PinnedModelProvider or LiveModelProvider) for the
 * same input.
 *
 * Returns a SemanticVarianceRecord that captures:
 *   - The fake provider's output hash.
 *   - The second provider's output hash (or a sentinel:
 *     "budget_breached" when over budget, "live_blocked" when the
 *     live call was blocked by a missing key or schema mismatch).
 *   - Whether they are the same (should be false — different providers).
 *   - A human-readable English description of the variance.
 */
export const SemanticVarianceRecordSchema = z.object({
  /** Output hash from the DeterministicFakeProvider for the same input. */
  fakeOutputHash:       z.string().length(64),
  /**
   * Output hash from the second provider. Either a 64-char SHA-256
   * hex string or one of the sentinel values "budget_breached" or
   * "live_blocked" when the second provider did not produce output.
   */
  pinnedOutputHash:     z.string().min(1),
  /** True if both hashes are identical (unexpected — should be false). */
  sameHash:              z.boolean(),
  /** Human-readable English description of the variance. */
  variance:              z.string().min(1),
});
export type SemanticVarianceRecord = z.infer<typeof SemanticVarianceRecordSchema>;
