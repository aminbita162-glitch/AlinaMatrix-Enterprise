/**
 * Live model provider contracts — R3 (real call).
 *
 * Zod schemas for the live model provider:
 *   - LiveModelConfigSchema        — pins model id, temperature, schema
 *                                    version, budget ceiling, plus API
 *                                    endpoint config (key env var + base URL).
 *   - LiveCallBlockedResultSchema  — returned when the live call cannot
 *                                    execute (missing API key, etc.).
 *   - LiveModelOutputSchema         — the schema the model's response
 *                                    validates against. Unknown keys in
 *                                    the raw model response are dropped
 *                                    before validation.
 *
 * Directive R3:
 *   "Add one real pinned model call beside DeterministicFakeProvider.
 *    Pin model id, temperature, schema version, and budget ceiling.
 *    Validate output against the schema. Drop unknown keys. If the call
 *    cannot run here, write the exact blocker and stop."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

// ============================================================
// Live model config — pinned fields + API endpoint
// ============================================================

export const LiveModelConfigSchema = z.object({
  /** Pinned model identifier (e.g. "gpt-4o-mini"). */
  modelId:                  z.string().min(1).max(256),
  /** Pinned sampling temperature (0–2 inclusive). */
  temperature:              z.number().min(0).max(2),
  /** Pinned schema version string (e.g. "m03-live-v1"). */
  schemaVersion:            z.string().min(1).max(128),
  /** Budget ceiling in minor units (bigint — exact). */
  budgetCeilingMinorUnits:  z.bigint(),
  /** Environment variable name for the API key (e.g. "OPENAI_API_KEY"). */
  apiKeyEnvVar:             z.string().min(1).max(64),
  /** API base URL (e.g. "https://api.openai.com/v1"). */
  apiBaseUrl:               z.string().url().max(512),
});
export type LiveModelConfig = z.infer<typeof LiveModelConfigSchema>;

// ============================================================
// Live call blocked result — returned when the call cannot run
// ============================================================

export const LiveCallBlockedResultSchema = z.object({
  /** True — the live call was blocked. */
  blocked:  z.literal(true),
  /** English reason the call was blocked (the exact blocker). */
  reason:   z.string().min(1),
});
export type LiveCallBlockedResult = z.infer<typeof LiveCallBlockedResultSchema>;

// ============================================================
// Live model output — validated, unknown keys dropped
// ============================================================

/**
 * The schema the model's response validates against after unknown keys
 * are dropped. The provider wraps the model's `result` (and optional
 * `reasoning`) with pinned metadata fields. Unknown keys from the raw
 * model response never reach this schema — they are stripped first.
 */
export const LiveModelOutputSchema = z.object({
  _provider:        z.literal("LiveModelProvider"),
  _modelId:         z.string().min(1).max(256),
  _temperature:     z.number().min(0).max(2),
  _schemaVersion:   z.string().min(1).max(128),
  /** The model's decision summary (required, non-empty). */
  result:           z.string().min(1).max(8192),
  /** Optional reasoning text from the model. */
  reasoning:        z.string().max(4096).optional(),
});
export type LiveModelOutput = z.infer<typeof LiveModelOutputSchema>;
