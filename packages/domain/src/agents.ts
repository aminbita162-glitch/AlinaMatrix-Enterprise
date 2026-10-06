/**
 * Domain logic for agent capabilities, fake provider, and cache key derivation.
 *
 * Covers:
 *   - AgentCapability type and per-agent capability maps (four agents only)
 *   - assertAgentCapability — throws CapabilityDeniedError when denied
 *   - buildCacheKey — deterministic SHA-256 from versioned inputs + tenant_id
 *   - DeterministicFakeProvider — same prompt+schema+inputHash → same JSON output
 *   - assertJobNotCancelled — prevents a CANCELLED job from advancing
 *
 * Directive R07: never call a live LLM.
 * Directive Phase 5 additive control: cache key must include tenant_id.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { createHash } from "node:crypto";

// ============================================================
// Agent capabilities
// ============================================================

export type AgentCapability =
  | "READ_SOURCE"
  | "READ_EVIDENCE"
  | "WRITE_DRAFT"
  | "RUN_VALIDATION"
  | "COMPILE_ARTIFACT"
  | "READ_USAGE"
  | "WRITE_CACHE_METADATA";

/** Capabilities that no agent may ever hold. */
const FORBIDDEN_CAPABILITIES: ReadonlySet<AgentCapability> = new Set([
  // Phase 5 directive: "None may release or export."
]);

/** All release/export operations — blocked regardless of declared capabilities. */
const RELEASE_OPERATIONS: ReadonlySet<string> = new Set([
  "RELEASE",
  "EXPORT",
]);

export type AgentName =
  | "AlinaArchitect"
  | "AlinaGuard"
  | "AlinaDocEngine"
  | "AlinaOptimizer";

/**
 * Directive Phase 5 capability grants.
 * Exactly four agents; capabilities are frozen here.
 */
export const AGENT_CAPABILITIES: Readonly<Record<AgentName, ReadonlySet<AgentCapability>>> = {
  AlinaArchitect: new Set(["READ_SOURCE", "READ_EVIDENCE", "WRITE_DRAFT"]),
  AlinaGuard:     new Set(["READ_EVIDENCE", "RUN_VALIDATION"]),
  AlinaDocEngine: new Set(["COMPILE_ARTIFACT"]),
  AlinaOptimizer: new Set(["READ_USAGE", "WRITE_CACHE_METADATA"]),
};

/**
 * Thrown when an agent attempts an operation outside its capability set,
 * or when any agent attempts a release/export operation.
 */
export class CapabilityDeniedError extends Error {
  constructor(agent: string, capability: string) {
    super(
      `Agent "${agent}" does not have capability "${capability}". ` +
      "Check AGENT_CAPABILITIES in the domain layer.",
    );
    this.name = "CapabilityDeniedError";
  }
}

/**
 * Assert that the named agent holds the requested capability.
 * Also blocks any release/export operation for all agents.
 * Throws CapabilityDeniedError on denial.
 */
export function assertAgentCapability(
  agent: AgentName,
  capability: AgentCapability | string,
): void {
  // Block release/export for every agent unconditionally.
  if (RELEASE_OPERATIONS.has(capability.toUpperCase())) {
    throw new CapabilityDeniedError(agent, capability);
  }
  const granted = AGENT_CAPABILITIES[agent] as ReadonlySet<string> | undefined;
  if (!granted || !granted.has(capability)) {
    throw new CapabilityDeniedError(agent, capability);
  }
  void FORBIDDEN_CAPABILITIES; // referenced to satisfy linter (empty set)
}

// ============================================================
// Cache key
// ============================================================

/**
 * Parameters that uniquely identify a deterministic fake-provider call.
 * All fields are version-pinned strings.  tenant_id is mandatory so that
 * the cache key is always tenant-scoped (cross-tenant miss guaranteed).
 */
export interface CacheKeyParams {
  tenantId:          string;
  /** Sorted, pipe-joined source version ids. */
  sourceVersionIds:  string[];
  promptSha256:      string;
  modelId:           string;
  schemaSha256:      string;
  policySha256:      string;
  /** Additional stable input hash (e.g. SHA-256 of the prompt-rendered content). */
  inputHash:         string;
}

/**
 * Build a deterministic cache key by SHA-256-hashing a canonical
 * pipe-delimited concatenation of all versioned inputs.
 *
 * Because tenant_id is the first component, two tenants with identical
 * versioned inputs will always receive different cache keys.
 */
export function buildCacheKey(params: CacheKeyParams): string {
  // Sort source version ids to guarantee canonical order.
  const sortedSvIds = [...params.sourceVersionIds].sort().join(",");
  const canonical = [
    params.tenantId,
    sortedSvIds,
    params.promptSha256,
    params.modelId,
    params.schemaSha256,
    params.policySha256,
    params.inputHash,
  ].join("|");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

// ============================================================
// Deterministic fake provider
// ============================================================

/**
 * Input to a single fake-provider call.
 * inputHash is the caller-supplied SHA-256 of the rendered prompt content.
 */
export interface FakeProviderInput {
  promptSha256:     string;
  schemaSha256:     string;
  inputHash:        string;
  /** Arbitrary context string that is included in the output for traceability. */
  context?:         string;
}

/**
 * Output from a fake-provider call.
 */
export interface FakeProviderOutput {
  /** Stable JSON string; same inputs → same value. */
  outputJson:    string;
  /** SHA-256 of outputJson, for audit. */
  outputHash:    string;
  promptTokens:     number;
  completionTokens: number;
}

/**
 * DeterministicFakeProvider
 *
 * Implements directive R07: never call a live LLM.
 * Given the same (promptSha256, schemaSha256, inputHash) the output is
 * always identical — no randomness, no temperature variation.
 *
 * Token counts are derived deterministically from the input hashes so
 * usage_event rows contain reproducible values.
 */
export class DeterministicFakeProvider {
  /** Call the fake provider.  Pure function; no I/O. */
  call(input: FakeProviderInput): FakeProviderOutput {
    // Build a deterministic seed from the three pinned hashes.
    const seed = `${input.promptSha256}:${input.schemaSha256}:${input.inputHash}`;
    const outputHash = createHash("sha256").update(seed, "utf8").digest("hex");

    // Produce a deterministic JSON object whose shape satisfies any downstream
    // schema validation fixture.  The values are derived from the seed hash
    // so they are reproducible but not guessable.
    const outputJson = JSON.stringify({
      _provider:    "DeterministicFakeProvider",
      _seed:        seed.substring(0, 32),
      _outputHash:  outputHash,
      context:      input.context ?? null,
      result:       outputHash.substring(0, 16),
    });

    // Derive token counts from the seed — stable integers, never zero.
    const seedBytes = Buffer.from(outputHash, "hex");
    const promptTokens     = (seedBytes[0]! * 4) + 10;
    const completionTokens = (seedBytes[1]! * 2) + 5;

    return { outputJson, outputHash, promptTokens, completionTokens };
  }
}

/** Singleton instance; callers should use this unless they need a new instance for testing. */
export const fakeProvider = new DeterministicFakeProvider();

// ============================================================
// Job cancellation guard
// ============================================================

/**
 * Thrown when an operation is attempted on a CANCELLED job.
 * A cancelled job may not be advanced, published, or have new events appended
 * after the cancellation event itself.
 */
export class CancelledJobError extends Error {
  constructor(jobId: string) {
    super(`Job "${jobId}" is CANCELLED and cannot be advanced or published.`);
    this.name = "CancelledJobError";
  }
}

/**
 * Assert that a job is not in the CANCELLED state.
 * Throws CancelledJobError when the state is CANCELLED.
 *
 * Must be called before any state transition or publish attempt.
 */
export function assertJobNotCancelled(jobId: string, state: string): void {
  if (state === "CANCELLED") {
    throw new CancelledJobError(jobId);
  }
}
