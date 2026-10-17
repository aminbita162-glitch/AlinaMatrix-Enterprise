# Level Up — Phase D Report: Evidence Depth

**Status:** Enterprise Candidate — Active Development

**Date:** 2026-10-17

**Phase:** Level Up — Phase D (Evidence Depth)

---

## Directive (verbatim)

> Assumption register: each assumption has source, owner, and expiry.
> Quote-lock: a claim without a valid quote cannot reach RELEASED.
> Numeric reconciliation: numbers in the document are checked against the
> source; differences are recorded, not corrected.
> Negative evidence: absence in the source is recorded, not left silent.
> Tests for each. No invented claim. Gate exit 0. Stop.

---

## Summary

Phase D implements four evidence-depth units as pure-domain vertical slices
(contracts + domain + test). Each unit is self-contained, gated, and committed
separately. No migration was required — all four are pure-domain modules with
no database access. No invented claim, score, URL, or customer.

The four units:

1. **Assumption register** — each assumption has a source, an owner, and an
   expiry date. An assumption missing any of those is a register violation,
   not a valid assumption with a blank field. An expired assumption must be
   re-validated or retired, not silently kept.
2. **Quote-lock release gate** — a witnessed claim without a valid quote-lock
   cannot reach `RELEASED`. The gate blocks when any witnessed claim referenced
   by a build lacks a valid quote-lock, and adds an extra reason when the
   release is already in `RELEASED` state.
3. **Numeric reconciliation** — numbers in the document are checked against the
   source; differences are recorded as `NumericReconciliationRecord`s, not
   corrected. The difference is always `documentValue - sourceValue` (never the
   other way). Inputs are never mutated.
4. **Negative evidence** — absence in the source is recorded, not left silent.
   `recordNegativeEvidence` produces a structured `NegativeEvidenceRecord`
   with a non-empty note. A blank note is rejected — silence is a violation.

---

## Units and Commits

| # | Unit | Commit | Files | Tests |
|---|------|--------|-------|-------|
| 1 | Assumption register (source, owner, expiry) | `25cb663` | `packages/contracts/src/assumption-register.ts`, `packages/domain/src/assumption-register.ts`, `packages/domain/src/assumption-register.test.ts` | 21 |
| 2 | Quote-lock release gate (no RELEASED without valid quote) | `94eece0` | `packages/domain/src/quote-lock-release.ts`, `packages/domain/src/quote-lock-release.test.ts` | 13 |
| 3 | Numeric reconciliation (differences recorded, not corrected) | `7124800` | `packages/domain/src/numeric-reconciliation.ts`, `packages/domain/src/numeric-reconciliation.test.ts` | 19 |
| 4 | Negative evidence (absence recorded, not silent) | `43f0dce` | `packages/domain/src/negative-evidence.ts`, `packages/domain/src/negative-evidence.test.ts` | 22 |
| 5 | Report | (this commit) | `docs/phases/level-up-phase-d-report.md` | — |

Each commit's index exports (`packages/contracts/src/index.ts`,
`packages/domain/src/index.ts`) were updated in the same commit as the unit.
Total new tests: **75** (21 + 13 + 19 + 22).

---

## Gate Results

| Command | Exit Code | Notes |
|---------|-----------|-------|
| `pnpm typecheck` | 0 | 6 workspace projects — all `tsc --noEmit` pass |
| `pnpm test` | 0 | 1013 passed, 103 skipped (101 integration + 2 live-model real-call) |
| `pnpm lint` | 0 | `eslint . --max-warnings 0` — clean |

### Test counts (per package)

| Package | Tests | Skipped |
|---------|-------|---------|
| `packages/domain` | 514 passed | 2 skipped (live-model real call — no API key) |
| `packages/renderer` | 86 passed | 0 |
| `packages/db` | 323 passed | 101 skipped (integration — no `DATABASE_URL` + `SUPERUSER_URL`) |
| `apps/api` | 90 passed | 0 |
| **Total** | **1013 passed** | **103 skipped** |

Prior to Phase D: 938 passed, 103 skipped. After Phase D: 1013 passed, 103
skipped. **+75 new tests**, all in `packages/domain`. A skipped test is not
passed.

---

## Requirements Matrix

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Assumption register: each assumption has source, owner, and expiry | **Done** | `assertAssumptionRegistered` throws `AssumptionRegisterError` when any field is missing/blank; `checkAssumptionExpiry` / `assertAssumptionNotExpired` enforce expiry; 21 tests pass |
| Quote-lock: a claim without a valid quote cannot reach RELEASED | **Done** | `checkQuoteLockReleaseGate` blocks when a witnessed claim's `quoteLocked` is false; adds a release-state reason when the source job is `RELEASED`; 13 tests pass |
| Numeric reconciliation: differences recorded, not corrected | **Done** | `reconcileNumber` returns `difference = documentValue - sourceValue`; inputs never mutated; `discrepanciesOnly` returns only non-matching records; 19 tests pass |
| Negative evidence: absence recorded, not silent | **Done** | `recordNegativeEvidence` rejects a blank note (`NegativeEvidenceRecordError`); `recordFragmentAbsence` builds a standard absence note; `absencesForSource` filters by source version; 22 tests pass |
| Tests for each | **Done** | 75 new tests across 4 test files, all passing |
| No invented claim | **Honored** | No claim, score, URL, customer, or citation is invented |
| Gate exit 0 | **Verified** | typecheck 0, test 0, lint 0 |
| Stop | **Honored** | Phase D complete. Do not start Phase E. |

---

## What Changed

### New files

- `packages/contracts/src/assumption-register.ts` — `AssumptionRegisterEntrySchema`,
  `AssumptionExpiryResultSchema`.
- `packages/domain/src/assumption-register.ts` — `AssumptionRegisterError`,
  `assertAssumptionRegistered`, `assertAllAssumptionsRegistered`,
  `checkAssumptionExpiry`, `assertAssumptionNotExpired`,
  `filterExpiredAssumptions`.
- `packages/domain/src/assumption-register.test.ts` — 21 tests.
- `packages/domain/src/quote-lock-release.ts` — `QuoteLockReleaseError`,
  `checkQuoteLockReleaseGate`, `assertQuoteLockReleaseGate`,
  `QuoteLockClaimRef`, `QuoteLockReleaseResult`.
- `packages/domain/src/quote-lock-release.test.ts` — 13 tests.
- `packages/domain/src/numeric-reconciliation.ts` — `NumericReconciliationError`,
  `reconcileNumber`, `reconcileNumbers`, `discrepanciesOnly`,
  `assertAllNumbersReconcile`, `NumericPair`, `NumericReconciliationRecord`.
- `packages/domain/src/numeric-reconciliation.test.ts` — 19 tests.
- `packages/domain/src/negative-evidence.ts` — `NegativeEvidenceRecordError`,
  `recordNegativeEvidence`, `assertNegativeEvidenceRecorded`,
  `buildAbsenceNote`, `recordFragmentAbsence`, `absencesForSource`,
  `NegativeEvidenceKind`, `NegativeEvidenceRecord`.
- `packages/domain/src/negative-evidence.test.ts` — 22 tests.
- `docs/phases/level-up-phase-d-report.md` — this report.

### Modified files

- `packages/contracts/src/index.ts` — re-exports for
  `AssumptionRegisterEntrySchema`, `AssumptionExpiryResultSchema`.
- `packages/domain/src/index.ts` — re-exports for all four units.

### Not touched

- No migrations (pure-domain units).
- No `render.yaml`, no `README.md`, no `scorecard.md`, no `DIRECTIV.txt`.
- No `apps/api` or `apps/web` source.
- No `packages/db` source.
- No `packages/renderer` source.
- `docs/eval/m03-latest.md` — restored after each gate run (non-deterministic
  golden-file regeneration).

---

## Design Notes

### Assumption register vs existing `M03AssumptionSchema`

The existing `M03AssumptionSchema` (Phase 6) models an assumption inside the
M03 content model with `id`, `statement`, `risk`, `owner`. It does not carry a
`source` or `expiry`. Phase D's assumption register is a new, orthogonal
contract: it adds `source` (where the assumption comes from) and `expiry`
(when it stops being trusted) as required fields, plus a `projectId` scope.
The register is the authority for whether an assumption is still in force.

### Quote-lock release gate vs existing `assertQuoteLock`

The existing `assertQuoteLock` (Phase 4) validates a single witnessed claim's
quote against a fragment substring + hash. Phase D's quote-lock release gate
is the release-level composition: it takes a list of `QuoteLockClaimRef`s
(which claim is witnessed, and whether its quote-lock has been validated) and
blocks the release when any witnessed claim lacks a valid quote-lock. The
gate does not re-validate the quote — it trusts the `quoteLocked` flag set by
the caller (who ran `assertQuoteLock` before populating the flag).

### Numeric reconciliation vs existing `detectUnitMismatch`

The existing `detectUnitMismatch` (Phase 4) detects a *unit* mismatch
(different units for the same subject + predicate). Phase D's numeric
reconciliation is a *value* reconciliation: it compares the document value
against the source value for the same label, records the difference
(`documentValue - sourceValue`), and never corrects it. The two are
complementary — one catches unit mismatches, the other catches value
discrepancies.

### Negative evidence vs existing `assertNegativeEvidenceNote`

The existing `assertNegativeEvidenceNote` (Phase 4) requires a
`negative_evidence_note` when `support_status` is "supported" or `claim_type`
is "inferred" — it says the note *must exist*. Phase D's negative evidence
recorder *produces* the note and a structured `NegativeEvidenceRecord` with
a `sourceVersionId`, `expectedLabel`, `expectedKind`, and a non-empty `note`.
The guard says the note must not be blank; the recorder says the absence is
recorded with provenance (which source was searched, what was expected).

---

## Residual Risks

1. **No DB persistence.** All four units are pure-domain. The assumption
   register, quote-lock release gate, numeric reconciliation, and negative
   evidence records are not yet persisted. A future migration would store
   them, but Phase D does not require it — the directive says "tests for each"
   and the tests are pure.
2. **No API wiring.** The four units are exported from the domain index but
   not yet wired into `apps/api` routes. A future phase may expose them.
3. **No live deploy.** Phase D does not deploy or call a live service. The
   deploy blocker from Phase A/C (no Render account, no live PostgreSQL)
   remains. Phase D is pure-domain and does not depend on a live service.
4. **Quote-lock release gate trusts the caller's `quoteLocked` flag.** The
   gate does not re-run `assertQuoteLock` — it trusts that the caller set
   `quoteLocked` after validating the quote. A future phase may compose the
   two so the gate re-validates on the fly, but Phase D's directive says
   "a claim without a valid quote cannot reach RELEASED" — the gate enforces
   that invariant on the flag, which is the contract.

---

## Honest Status

- **Phase D units:** All four built, tested, gated, committed. 75 new tests.
- **Deploy:** Not required by Phase D. Not run. The blocker from Phase A/C
  remains (no Render account, no live PostgreSQL).
- **Candidate:** Maintained. Not production. A small test count is not proof
  of real-world capacity.
- **Status line:** Enterprise Candidate — Active Development.

---

## Stop

Phase D complete. Gate passed (typecheck 0, test 0, lint 0). 75 new tests.
No invented claim. Do not start Phase E.
