# ADR-0001 — Beachhead: Module M03 Only

**Status:** Accepted  
**Date:** 2026-10-01  
**Author:** Amin Azimi, Azimi Innovation Lab  
**Project:** AlinaMatrix Enterprise 1.0.0  
**Maturity:** Enterprise Candidate — Active Development

---

## Context

AlinaMatrix Enterprise is a professional AI document engineering and evidence-control platform.
The full product vision spans modules M01–M30, covering document types, domain verticals, and
specialised pipeline variants. Shipping all modules in parallel would produce an untestable,
unauditable system with no proven core.

The team must select a single module to prove the end-to-end pipeline:
source → ingest → evidence → architect → generate → guard → human review → doc engine →
build manifest → release → audit.

## Decision

**Beachhead is M03 only: Architecture Decision Record.**

An Architecture Decision Record is the simplest, most self-contained document type that exercises
the full pipeline. It has a well-defined content model, structured evidence requirements, and a
small enough scope to be built and tested within Phase 1–10 of this directive.

Modules M01–M02 and M04–M30 are explicitly deferred. They must not be implemented, scaffolded,
or referenced in code until a separate directive revision authorises them.

## Consequences

**Positive:**
- The full pipeline is proven end-to-end before any further investment.
- All invariants (immutability, quote-lock, four-eyes, provenance) are tested on a real document type.
- Scope is bounded, making the system auditable and honest about its current capability.

**Negative:**
- The system produces ADRs only. Other document types cannot be generated.
- Any customer requiring a different document type cannot be served until a later phase.

**Residual risk:**
- M03 beachhead is not yet proven. No production claim is made.
- The content model for ADR may require revision once real-world usage data is available.

## Open blockers

- None at Phase 1. Domain content model defined in Phase 6.
