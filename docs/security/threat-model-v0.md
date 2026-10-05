# Threat Model v0 — AlinaMatrix Enterprise

**Version:** 0.1  
**Date:** 2026-10-01  
**Author:** Amin Azimi, Azimi Innovation Lab  
**Scope:** Phase 1 skeleton (no auth, no DB, no agents in scope)  
**Maturity:** Enterprise Candidate — Active Development

> **Honesty note:** This is an initial threat model for the Phase 1 skeleton.
> No security controls are in place yet. All items below are open risks until the
> corresponding phase implements and tests them.

---

## System Assets

| Asset | Phase introduced | Notes |
|---|---|---|
| Source documents (PDFs, DOCX, etc.) | Phase 3 | Immutable; sha256-pinned |
| Claim atoms and evidence | Phase 4 | Provenance-linked to source fragments |
| Tenant data | Phase 2 | Isolated via PostgreSQL RLS |
| Auth credentials (hashed) | Phase 2 | argon2id |
| Audit log | Phase 2+ | Append-only; update/delete denied |
| Artifact HTML and manifest | Phase 8 | Immutable after publish |
| Agent prompts and schema versions | Phase 5 | Pinned per run |

---

## Threat Actors

| Actor | Description |
|---|---|
| Unauthenticated external attacker | No session; attempts to reach protected resources |
| Authenticated user in Tenant A | Attempts to read or modify Tenant B data |
| Malicious document uploader | Embeds prompt injection text or malicious MIME content |
| Compromised author | Attempts self-approval or suppression of findings |
| Insider with DB access | Attempts to mutate audit records directly |

---

## Threat Catalogue

### T01 — Authentication Bypass
- **Phase:** 2  
- **Status at Phase 1:** Open — no auth exists yet  
- **Mitigation:** argon2id login; httpOnly cookie; server-side session validation  
- **Test coverage:** Planned Phase 2

### T02 — Authorisation Bypass (Horizontal)
- **Phase:** 2  
- **Status at Phase 1:** Open — no authz exists yet  
- **Mitigation:** PostgreSQL RLS; server-derived tenant context; membership-based isolation  
- **Test coverage:** Planned Phase 2 ("Tenant A cannot read or write Tenant B")

### T03 — Tenant Data Breach via Missing RLS Setting
- **Phase:** 2  
- **Status at Phase 1:** Open  
- **Mitigation:** Unset `app.current_tenant_id` fails closed (returns no rows)  
- **Test coverage:** Planned Phase 2

### T04 — Path Traversal in Object Storage
- **Phase:** 2  
- **Status at Phase 1:** Open  
- **Mitigation:** Object storage driver rejects any key containing `..` or absolute path components  
- **Test coverage:** Planned Phase 2

### T05 — Prompt Injection via Source Document
- **Phase:** 6  
- **Status at Phase 1:** Open  
- **Mitigation:** Prompt-injection fixture must not change the generated plan (tested in Phase 6)  
- **Test coverage:** Planned Phase 6

### T06 — Source Immutability Violation
- **Phase:** 3  
- **Status at Phase 1:** Open  
- **Mitigation:** sha256 stored at upload; second write of same version bytes rejected  
- **Test coverage:** Planned Phase 3

### T07 — Audit Record Mutation
- **Phase:** 2  
- **Status at Phase 1:** Open  
- **Mitigation:** DB trigger denies UPDATE/DELETE on audit_events  
- **Test coverage:** Planned Phase 2

### T08 — Self-Approval (Four-Eyes Violation)
- **Phase:** 7  
- **Status at Phase 1:** Open  
- **Mitigation:** Author cannot be sole release approver; enforced in review API  
- **Test coverage:** Planned Phase 7

### T09 — XSS in Rendered HTML
- **Phase:** 8  
- **Status at Phase 1:** Open  
- **Mitigation:** Renderer uses an allowlist of known content model keys; unknown keys dropped  
- **Test coverage:** Planned Phase 8

### T10 — SQL Injection
- **Phase:** 2+  
- **Status at Phase 1:** Open  
- **Mitigation:** Parameterised queries only; no string interpolation in SQL  
- **Test coverage:** Planned Phase 2+

### T11 — Malicious MIME / Oversized Upload
- **Phase:** 3  
- **Status at Phase 1:** Open  
- **Mitigation:** MIME sniff + declared type check; size cap enforced  
- **Test coverage:** Planned Phase 3

### T12 — Secret Leakage via Logs
- **Phase:** 2  
- **Status at Phase 1:** Open  
- **Mitigation:** Logger redacts secret-shaped strings before output  
- **Test coverage:** Planned Phase 2

---

## Residual Risk (Phase 1)

All twelve threats listed above are **open**. Phase 1 delivers no authentication, no database,
no agent runtime, and no file handling. The threat model is documented here to establish the
baseline before any controls are implemented.

No production claim is made. Do not deploy Phase 1 output as a production system.

## Open Blockers

- All threats are open. They are resolved phase-by-phase per the DIRECTIVE.
