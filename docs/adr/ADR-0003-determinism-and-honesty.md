# ADR-0003 — Determinism and Honesty Policy

**Status:** Accepted  
**Date:** 2026-10-01  
**Author:** Amin Azimi, Azimi Innovation Lab  
**Project:** AlinaMatrix Enterprise 1.0.0  
**Maturity:** Enterprise Candidate — Active Development

---

## Context

AlinaMatrix Enterprise processes and generates professional artifacts that may inform
high-stakes decisions. The system must be honest about what it can and cannot guarantee,
and it must not misrepresent the provenance or reproducibility of its outputs.

Two failure modes must be explicitly addressed:

1. **False determinism**: claiming that identical inputs always produce identical outputs
   when that is not provable (e.g., temperature=0 is not factual correctness).
2. **False honesty**: suppressing or softening failure counts, unsupported claims,
   or open limitations in reports to appear more production-ready than the system is.

## Decision

### Determinism

"1000% deterministic" is a quality slogan, not a provable system property.

The required invariant is:
- **Versioned inputs**: every source, prompt, model version, schema version, and policy version
  is recorded and pinned at the time of a run.
- **Pinned generation**: temperature, sampling parameters, and model weights are fixed per run.
- **Constrained generation**: output is validated against a schema; non-conforming output fails,
  it is not silently accepted.
- **Reproducible build**: the same input set, prompt version, model version, schema, and policy
  must produce the same output hash in a replay test (Phase 8).
- **Immutable audit**: no run record may be mutated after creation.
- **Human approval where required**: the system does not self-certify outputs.

Temperature=0 is a sampling setting. It does not guarantee factual correctness.
That claim must never appear in documentation, UI, or commit messages.

### Honesty

- The system status is exactly: **Enterprise Candidate — Active Development**.
  No other status is permitted until a separate revision of this directive.
- A test not executed is not passed. A failed test is recorded as failed.
- If N tests fail, the report states N failed. Failures are not averaged away.
- No invented citations, DOI, PMID, ISBN, patent numbers, expert scores, or benchmark results.
- Known limitations and open blockers are listed in every phase report and in the README.
- The product sentence is exactly: "Turn complex evidence into auditable professional artifacts."
  The phrase "AI writes your documents" must not appear.

### DeterministicFakeProvider

No live LLM may be called by the system. Until a later directive revision explicitly permits it,
all agent calls use `DeterministicFakeProvider`:
- Same prompt version + schema version + input hash → same JSON output.
- Every fake call writes a usage row (tenant, project, agent, model version, token counts, cost).
- The provider is tested for idempotency in Phase 5.

## Consequences

**Positive:**
- Test results are reproducible in CI without a live model.
- Phase reports are honest; no suppressed failures.
- Audit records cannot be silently corrected.

**Negative:**
- The system cannot ship real AI-generated content until `DeterministicFakeProvider` is replaced
  by a live provider, which requires a separate directive revision and human approval.
- The determinism invariant requires more engineering than a simple temperature=0 setting.

**Residual risk:**
- Replay test (Phase 8) is the only machine-verifiable proof of the determinism invariant.
  Until Phase 8 is complete, the invariant is stated policy, not proven fact.

## Open blockers

- None at Phase 1.
