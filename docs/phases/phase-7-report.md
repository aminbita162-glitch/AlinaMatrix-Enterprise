# Phase 7 Report — Human Review

Status: Enterprise Candidate — Active Development

## Gate commands and exit codes

| Command          | Exit code | Notes                                                  |
|------------------|-----------|--------------------------------------------------------|
| `pnpm typecheck` | 0         | All 6 packages clean (apps/web, apps/api, packages/*)  |
| `pnpm test`      | 0         | 460 passed, 0 failed, 101 skipped (no live DB in gate) |
| `pnpm lint`      | 0         | 0 errors, 0 warnings                                   |

## Test counts (gate run — no live DB)

| Package          | Test file                          | Passed | Failed | Skipped |
|------------------|------------------------------------|--------|--------|---------|
| packages/domain  | workflow.test.ts                   | 12     | 0      | 0       |
| packages/domain  | agents.test.ts                     | 51     | 0      | 0       |
| packages/domain  | generate.test.ts                   | 25     | 0      | 0       |
| packages/domain  | claims.test.ts                     | 35     | 0      | 0       |
| packages/domain  | architect.test.ts                  | 22     | 0      | 0       |
| packages/domain  | review.test.ts (Phase 7)          | 28     | 0      | 0       |
| packages/domain  | guard.test.ts                      | 37     | 0      | 0       |
| packages/db      | m03.test.ts                        | 22     | 0      | 0       |
| packages/db      | sources.test.ts                    | 19     | 0      | 0       |
| packages/db      | claims.test.ts                     | 28     | 0      | 0       |
| packages/db      | review.test.ts (Phase 7)          | 36     | 0      | 0       |
| packages/db      | agents.test.ts                     | 38     | 0      | 0       |
| packages/db      | rls.test.ts                        | 8      | 0      | 0       |
| packages/db      | audit.test.ts                      | 5      | 0      | 0       |
| packages/db      | injection.test.ts                  | 10     | 0      | 0       |
| packages/db      | agents.integration.test.ts         | 0      | 0      | 24      |
| packages/db      | sources.integration.test.ts        | 0      | 0      | 28      |
| packages/db      | claims.integration.test.ts          | 0      | 0      | 35      |
| packages/db      | rls.integration.test.ts            | 0      | 0      | 14      |
| apps/api         | logger.test.ts                     | 5      | 0      | 0       |
| apps/api         | storage.test.ts                    | 11     | 0      | 0       |
| apps/api         | ingest.test.ts                     | 15     | 0      | 0       |
| apps/api         | router.test.ts                      | 2      | 0      | 0       |
| apps/api         | review.test.ts (Phase 7)           | 29     | 0      | 0       |
| apps/api         | auth.test.ts                       | 22     | 0      | 0       |
| **Total**        |                                    | **460**| **0**  | **101** |

Integration tests are skipped without `DATABASE_URL`. They require migrations 001–006 applied.

To run with live DB:
```
DATABASE_URL=postgres://app_user:***@localhost:5432/alinamatrix \
SUPERUSER_URL=postgres://alinamatrix:***@localhost:5432/alinamatrix \
  pnpm test
```

## Deliverables committed (5 separate commits + this report)

### Commit 1 — `phase-7: review tables` (011411d)
- `packages/db/migrations/006_human_review.sql`
  - Tables: `review_tasks` (one per workflow_run, UNIQUE), `approvals`, `comments`
  - `comments` immutability: `BEFORE UPDATE` and `BEFORE DELETE` triggers reject; GRANT SELECT, INSERT only
  - RLS ENABLE + FORCE on `review_tasks`; ENABLE on `approvals`, `comments` with tenant policies
  - `author_id` column on `review_tasks` for four-eyes enforcement
  - Migration registry entry `006_human_review`
- `docs/phases/phase-7-plan.md` — phase plan

### Commit 2 — `phase-7: review DB layer` (5e0e4c3)
- `packages/db/src/review.ts` — DB access layer:
  - `insertReviewTask` (ON CONFLICT idempotency), `getReviewTask`, `getReviewTaskByRun`,
    `listOpenReviewTasks`, `updateReviewTaskState`
  - `insertApproval`, `listApprovalsByTask`
  - `insertComment` (INSERT only, no UPDATE), `getComment`, `listCommentsByTask`
  - Row types: `ReviewTaskRow`, `ApprovalRow`, `CommentRow`
- `packages/db/src/review.test.ts` — 36 unit tests:
  - Migration SQL structural checks (11 tests): tables, immutability trigger, GRANT,
    RLS, four-eyes `author_id`, UNIQUE on `workflow_run_id`
  - `insertReviewTask` (3), `getReviewTask` (2), `getReviewTaskByRun` (2),
    `updateReviewTaskState` (2), `insertApproval` (4), `listApprovalsByTask` (2),
    `insertComment` (2), `getComment` (2), `listCommentsByTask` (2)
  - Tenant isolation contract (4)
- `packages/db/src/index.ts` — extended to export review DB functions and row types

### Commit 3 — `phase-7: claim approve/reject + four-eyes` (39bd578)
- `packages/domain/src/review.ts` — domain logic:
  - `approveClaim` / `rejectClaim` — update `reviewer_status`; reject keeps NEEDS_REVIEW
  - `canCompleteReview` — returns false when any claim is rejected
  - `assertFourEyes` — throws `FourEyesError` when author == sole approver
  - `assertNoRejectedClaims` — throws `RejectedClaimError`
  - Types: `ClaimReviewerStatus`, `ClaimDecisionInput`, `ClaimDecisionResult`,
    `ReviewClaimInput`, `ApproverRecord`
- `packages/domain/src/review.test.ts` — 28 tests:
  - `approveClaim` / `rejectClaim` (6)
  - `canCompleteReview` (5): all pending, one rejected, all approved, empty set, mixed
  - `assertNoRejectedClaims` (3)
  - `assertFourEyes` (10): no approvers, only author, author+independent, two independent,
    author as sole, rejection doesn't count, error message content, error name, non-author rejected
  - Error class shape (4): `FourEyesError` message/name, `RejectedClaimError` message/name
- `packages/domain/src/index.ts` — extended (review exports)

### Commit 4 — `phase-7: review contracts + API routes` (f9dd82d)
- `packages/contracts/src/review.ts` — Zod schemas:
  - `ReviewTaskStateSchema`, `CreateReviewTaskRequestSchema`, `ReviewTaskResponseSchema`
  - `ApprovalDecisionSchema`, `CreateApprovalRequestSchema`, `ApprovalResponseSchema`
  - `CreateCommentRequestSchema`, `CommentResponseSchema`
  - `ClaimDecisionRequestSchema`
- `packages/contracts/src/index.ts` — re-export all review schemas and types
- `apps/api/src/review.ts` — HTTP handlers:
  - `POST /review-tasks` — create task (session-scoped tenantId)
  - `GET /review-tasks` — list open tasks
  - `GET /review-tasks/:taskId` — get task with pane data (approvals + comments)
  - `POST /review-tasks/:taskId/approvals` — add approval (four-eyes enforced via `assertFourEyes`)
  - `GET /review-tasks/:taskId/approvals` — list approvals
  - `POST /review-tasks/:taskId/comments` — add immutable comment
  - `GET /review-tasks/:taskId/comments` — list comments
  - `POST /claims/:claimId/decision` — approve or reject a claim
- `apps/api/src/router.ts` — extended to mount all review routes with session resolution
- `apps/api/src/review.test.ts` — 29 tests:
  - `readBodyJson` (2)
  - `handleCreateReviewTask` (4): valid, invalid JSON, validation error, tenant from session
  - `handleGetReviewTask` (3): found, not found, includes approvals+comments
  - `handleListReviewTasks` (2): returns list, passes tenantId
  - `handleCreateApproval` (6): approved, rejected, four-eyes denied (422), not found, invalid JSON, validation
  - `handleListApprovals` (1)
  - `handleCreateComment` (4): valid, calls insertComment not update, not found, empty body
  - `handleListComments` (1)
  - `handleClaimDecision` (3): approved, rejected, invalid JSON
  - Router integration (3): 404 for unknown, 503 without DB, comment POST path

### Commit 5 — `phase-7: review UI` (3f37c21)
- `apps/web/app/layout.tsx` — root layout with navigation bar (Projects, Sources, Claims, Review)
  and the exact status line "Enterprise Candidate — Active Development"
- `apps/web/app/lib/api.ts` — API client: `apiGet`, `apiPost`, `ApiError`; response types
  mirroring `packages/contracts` (ReviewTask, Approval, Comment, Claim, Source); API base
  via `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:4000`)
- `apps/web/app/projects/page.tsx` — projects list table (name, ID, created)
- `apps/web/app/sources/page.tsx` — sources list table (name, MIME, version status, ID)
- `apps/web/app/claims/page.tsx` — claim inspector: table with subject, predicate, support,
  type, review status, and Approve/Reject buttons that POST to `/claims/:id/decision`
- `apps/web/app/review/page.tsx` — review queue: table of open tasks (state, ID, project,
  created) with "Open →" link to detail
- `apps/web/app/review/[taskId]/page.tsx` — three-pane review page:
  - **Pane 1 (Fragments)**: source fragments list with ordinal and page
  - **Pane 2 (Content — Comments)**: immutable comments list + "Add Comment" textarea;
    correction is a new comment, not an edit (enforced server-side by DB trigger)
  - **Pane 3 (Findings)**: approvals list + "Submit Approval" button (four-eyes enforced
    server-side) + claims list with per-claim Approve/Reject (✓/✗) buttons
  - Reject-claim warning: if any claim is rejected, an inline English error states the
    review cannot be completed until rejections are addressed
- Gate fixes in this commit: `apps/api/src/review.ts` (operator-precedence `??` fix),
  `apps/api/src/review.test.ts` (typed mock for `insertComment` call inspection),
  `packages/db/src/review.test.ts` (removed two unused imports that failed `pnpm lint`)

### Commit 6 — `phase-7: review report` (this file)
- `docs/phases/phase-7-report.md`

## Directive requirements satisfied

| Requirement | Status |
|-------------|--------|
| Tables: review_tasks, approvals, comments | ✓ (migration 006) |
| Comments immutable; correction is a new row | ✓ (DB trigger + GRANT SELECT, INSERT only) |
| API for three panes: fragments, content section, findings | ✓ (GET /review-tasks/:taskId + UI three-pane layout) |
| Claim-level approve/reject | ✓ (domain + API + UI buttons) |
| Reject keeps NEEDS_REVIEW | ✓ (canCompleteReview returns false; rejectClaim) |
| Four-eyes: author cannot be sole release approver | ✓ (assertFourEyes + FourEyesError + 422 in API) |
| Minimal dense UI: projects, sources, claim inspector, review queue | ✓ (4 pages + 3-pane detail) |
| Explicit English errors | ✓ (all UI errors inline in English; API messages English) |
| No decorative motion in the app | ✓ (no animation in apps/web; motion in README only) |
| Test: self-approval denied | ✓ (domain review.test.ts — assertFourEyes 10 tests; api review.test.ts — 422) |
| Test: rejected claim blocks completion | ✓ (canCompleteReview 5 tests) |
| Test: comment update denied | ✓ (db review.test.ts — INSERT only, no UPDATE; api — insertComment not update) |
| Test: tenant isolation | ✓ (db review.test.ts — 4 tenant isolation tests; api — tenantId from session) |
| Commit each unit separately | ✓ (5 commits + this report) |

## Residual risks and open limitations

- **Integration tests skipped**: 101 integration tests (agents, sources, claims, rls) require
  a live PostgreSQL instance with migrations 001–006 applied. They are skipped, not failed.
  The same harness was verified passing with a live DB in Phases 2–6.
- **UI is untested at the browser level**: `apps/web` has no browser-level test suite (Next.js
  `next lint` passes; `tsc --noEmit` passes). The UI fetches from the API at runtime via
  `fetch`; no automated render test exercises the pages. The API handlers and router
  integration are covered by 29 `apps/api` tests; the domain logic by 28 `packages/domain`
  tests; the DB layer by 36 `packages/db` tests.
- **No live API served in gate**: the UI pages call `NEXT_PUBLIC_API_BASE_URL` (default
  `http://localhost:4000`). No server is started during the gate; the gate verifies
  typecheck, unit/integration tests, and lint only. A running API + DB is needed to exercise
  the UI end-to-end.
- **Reviewer identity is hardcoded in UI**: the UI sends a placeholder `reviewerId`
  (`00000000-0000-4000-8000-000000000001`) in claim decisions and comments. A real session
  resolver (Phase 2 `resolveSession`) exists in the API; wiring the UI to pass the
  authenticated user's ID from the session cookie is a UI concern deferred to a later phase
  or integration wiring step.
- **Projects and sources list routes**: the UI calls `GET /projects` and `GET /sources`.
  The API router currently routes `/sources/upload` (POST) and `/sources/:id` (GET) but does
  not route a `GET /sources` list endpoint. The UI degrades gracefully (shows "Error" or
  "No sources found" on failure). A `GET /sources` list endpoint is not required by the
  Phase 7 directive and is deferred.
- **No production claim**: This system is Enterprise Candidate — Active Development.

## Out of scope (confirmed deferred)

- Phase 8: rendering, build manifest, PDF, watermark, replay test
- Phase 9: release gate, export, budget breaker, revocation
- Phase 10: golden test suite, scorecard, expert acceptance protocol
- Audio, billing, SSO, modules other than M03
