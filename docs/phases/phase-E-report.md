# Phase E — Templates and Consensus — Report

**Status line:** Enterprise Candidate — Active Development

**Directive text (Phase E):**

> Schema-driven M03 template: render only keys declared by the pinned
> schema. Multi-party consensus review: N named approvers, threshold,
> no self-approval, decision event append-only. Published bytes do not
> change. Tests for unknown key dropped, threshold not met, and
> self-approval rejected. Gate exit 0. Stop.

---

## Gate commands and exit codes

| Command         | Exit code |
|-----------------|-----------|
| `pnpm typecheck`| 0         |
| `pnpm test`     | 0         |
| `pnpm lint`      | 0         |

All three exit 0 before each commit. No push.

---

## Test counts

| Package              | Test files           | Tests                          |
|----------------------|----------------------|--------------------------------|
| `packages/contracts` | — (no test script)   | —                              |
| `packages/domain`    | 17 passed            | 381 passed                     |
| `packages/db`        | 16 passed, 4 skipped | 323 passed, 101 skipped         |
| `packages/renderer`  | 6 passed             | 86 passed                      |
| `apps/api`           | 6 passed             | 90 passed                      |

Phase E added tests (all new files, all pass):

| File                                    | New tests |
|-----------------------------------------|----------|
| `packages/domain/src/template.test.ts`  | 19       |
| `packages/domain/src/consensus.test.ts`  | 28       |
| `packages/db/src/consensus.test.ts`       | 21       |
| **Total new Phase E tests**              | **68**   |

Integration tests (`.integration.test.ts`) remain skipped without
`DATABASE_URL` + `SUPERUSER_URL` — a skipped test is not passed, and not
failed.

---

## Commits (per-unit, in order)

| Hash      | Unit                              | Message                                                                                                                              |
|-----------|-----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| `3223f28` | Schema-driven M03 template        | `follow-on-E: schema-driven M03 template (render only keys declared by pinned schema, unknown key dropped) - gate passed`             |
| `9c6fbe8` | Multi-party consensus review      | `follow-on-E: multi-party consensus review (N approvers, threshold, no self-approval, append-only decision events) - gate passed`     |
| (this)    | Report                             | `follow-on-E: report - gate passed`                                                                                                  |

---

## Deliverables

### Unit 1 — Schema-driven M03 template (commit `3223f28`)

- `packages/contracts/src/template.ts` — `M03TemplateSchema`,
  `M03TemplateSectionSchema`. The template declares a pinned set of
  section keys; only keys present in the pinned schema are renderable.
- `packages/domain/src/template.ts` — `M03_DEFAULT_TEMPLATE`,
  `M03_SCHEMA_KEYS` (the set of keys the pinned content-model schema
  declares), `resolveTemplateKeys` (template keys ∩ pinned schema keys),
  `assertTemplateKeyKnown` (throws `UnknownTemplateKeyError` for keys
  not in the pinned schema), `filterContentByTemplate` (drops content
  keys not declared by the template), `isKeyRenderable`.
- `packages/renderer/src/html.ts` — `renderHtmlTemplate(input, template)`
  replaces the old fixed-order loop; `renderHtml` now delegates to
  `renderHtmlTemplate(input, M03_DEFAULT_TEMPLATE)`. Unknown assertion
  keys are dropped (render only keys declared by the pinned schema).
- `packages/domain/src/template.test.ts` — 19 tests: unknown key
  dropped, known key rendered, template keys ∩ schema keys, filter
  removes undeclared keys.

### Unit 2 — Multi-party consensus review (commit `9c6fbe8`)

- `packages/contracts/src/consensus.ts` — `ConsensusConfigSchema`
  (`.refine()` for threshold ≤ approvers.length and no self-approval:
  author must not be in the approvers set), `ConsensusDecisionSchema`
  (`"approved"` / `"rejected"`), `ConsensusDecisionEventSchema`
  (append-only event: approver id, decision, timestamp, tenant id),
  `ConsensusStateSchema` (derived state: pending / approved / rejected,
  with approval/rejection counts and threshold).
- `packages/domain/src/consensus.ts` — `buildConsensusConfig` (validates
  N approvers, threshold > 0 and ≤ approvers.length, no self-approval,
  non-empty tenant id), `assertNoSelfApproval` (throws
  `SelfApprovalError` when the author submits an approval),
  `assertApproverAuthorized` (throws `UnknownApproverError` for
  non-approver submitters), `recordConsensusDecision` (appends a
  decision event — self-approval check ordered first so the author
  trips `SelfApprovalError`, not the broader `UnknownApproverError`),
  `evaluateConsensus` (pure: rejected when any rejection, approved when
  approvals ≥ threshold, pending otherwise — published bytes do not
  change), `assertConsensusApproved` (throws
  `ConsensusNotApprovedError` when threshold not met,
  `ConsensusRejectedError` when a rejection is present).
- `packages/domain/src/consensus.test.ts` — 28 tests: self-approval
  rejected (author in approvers set, author submitting approval), unknown
  approver rejected, threshold not met (pending, approved, rejected),
  determinism (same events + same config → same state), threshold-not-met
  rejection, rejection-blocks-approval.
- `packages/db/src/consensus.ts` — `consensus_decision_events` table
  access: `insertConsensusDecisionEvent` (INSERT only — append-only),
  `listConsensusDecisionEventsByTask` (ordered by `decided_at` ASC),
  `countConsensusApprovals`, `countConsensusRejections`.
- `packages/db/migrations/014_consensus_decision_events.sql` — table,
  immutability triggers (no UPDATE, no DELETE — append-only), RLS
  (tenant isolated: `consensus_decision_events_tenant` policy),
  GRANT (SELECT + INSERT only — no UPDATE, no DELETE), CHECK constraint
  on `decision` (`'approved'` / `'rejected'`), UNIQUE
  `(review_task_id, approver_id)` (one decision per approver per task),
  registry.
- `packages/db/src/consensus.test.ts` — 21 tests: SQL structural checks
  (table, triggers, GRANT excludes UPDATE/DELETE, RLS, CHECK, UNIQUE,
  registry), INSERT-only, query by `review_task_id`, count approvals /
  rejections, tenant isolation (tenant_id as second parameter).

---

## Requirements matrix

| Directive requirement                                       | Delivered by                                              |
|-------------------------------------------------------------|----------------------------------------------------------|
| Schema-driven M03 template                                  | `template.ts` (contracts + domain) + `html.ts` renderer   |
| Render only keys declared by the pinned schema              | `resolveTemplateKeys`, `filterContentByTemplate`, `renderHtmlTemplate` |
| Unknown key dropped                                         | `assertTemplateKeyKnown` + `filterContentByTemplate` (drops) |
| Multi-party consensus: N named approvers                    | `ConsensusConfigSchema.approvers` (min 1)                 |
| Threshold                                                   | `ConsensusConfigSchema.threshold` (`.refine()` ≤ approvers.length) |
| No self-approval                                            | `.refine()` (author ∉ approvers) + `assertNoSelfApproval`  |
| Decision event append-only                                  | migration 014 immutability triggers + INSERT-only GRANT    |
| Published bytes do not change                               | `evaluateConsensus` is pure (no `Date.now()`, no `Math.random()`) |
| Tests for unknown key dropped                                | `template.test.ts` (19 tests)                              |
| Tests for threshold not met                                  | `consensus.test.ts` (assertConsensusApproved, pending state) |
| Tests for self-approval rejected                             | `consensus.test.ts` (SelfApprovalError, assertNoSelfApproval) |
| Gate exit 0                                                  | typecheck, test, lint all 0                               |
| Stop at phase gate                                          | No Phase F work started                                    |

---

## Residual risks

- `evaluateConsensus` is a pure function of (events, config). The
  caller supplies timestamps; no `Date.now()` or `Math.random()` is
  used. A future integration test (with `DATABASE_URL`) should
  round-trip decision events through the real DB to confirm the
  append-only trigger fires on UPDATE/DELETE. That test is skipped
  without a database and is not failed.
- `recordConsensusDecision` orders `assertNoSelfApproval` before
  `assertApproverAuthorized`. The author is deliberately excluded from
  the approver set by `buildConsensusConfig`, so if the authorization
  check ran first the author would trip `UnknownApproverError` before
  the more specific `SelfApprovalError`. The most-specific check is
  ordered first.
- The consensus DB layer (`packages/db/src/consensus.ts`) defines its
  own `ConsensusDecisionEventRow` and `InsertConsensusDecisionEventParams`
  types locally (SQL rows, not Zod-validated domain types) — consistent
  with the established convention that the DB layer speaks SQL rows.
- No live LLM is called. No secrets, raw documents, or full prompts are
  logged. No client-supplied `tenant_id` is accepted as the isolation
  authority — the tenant id is server-derived from the session membership
  and passed into the DB layer as the second parameter.

---

## Status line

Enterprise Candidate — Active Development
