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

export const SemanticVarianceRecordSchema = z.object({
  /** Output hash from the DeterministicFakeProvider for the same input. */
  fakeOutputHash:       z.string().length(64),
  /** Output hash from the PinnedModelProvider for the same input. */
  pinnedOutputHash:     z.string().length(64),
  /** True if both hashes are identical (unexpected — should be false). */
  sameHash:              z.boolean(),
  /** Human-readable English description of the variance. */
  variance:              z.string().min(1),
});
export type SemanticVarianceRecord = z.infer<typeof SemanticVarianceRecordSchema>;
