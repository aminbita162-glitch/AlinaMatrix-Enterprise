# Phase 7 Plan — Human Review

Status: Enterprise Candidate — Active Development

## In-scope items

### Tables (migration 006)
- `review_tasks` — one per workflow_run; tracks assignment, state.
- `approvals` — one row per approver per task; records decision.
- `comments` — immutable; correction is a new row, never an UPDATE.

### DB layer (`packages/db/src/review.ts`)
- `insertReviewTask`, `getReviewTask`, `getReviewTaskByRun`, `updateReviewTaskState`
- `insertApproval`, `getApproval`, `listApprovalsByTask`
- `insertComment`, `getComment`, `listCommentsByTask`
- Comment UPDATE/DELETE denied by DB constraint (INSERT only; tested in unit tests via SQL inspection).

### Domain layer (`packages/domain/src/review.ts`)
- `approveClaim` / `rejectClaim` — update claim `reviewer_status`; reject keeps workflow in NEEDS_REVIEW.
- `canCompleteReview` — returns false when any claim is rejected.
- `assertFourEyes` — throws `FourEyesError` if author == sole approver.
- `FourEyesError`, `RejectedClaimError`

### Contracts (`packages/contracts/src/review.ts`)
- Zod schemas: `CreateReviewTaskRequestSchema`, `ReviewTaskResponseSchema`,
  `CreateApprovalRequestSchema`, `ApprovalResponseSchema`,
  `CreateCommentRequestSchema`, `CommentResponseSchema`,
  `ClaimDecisionRequestSchema`
- Export from `packages/contracts/src/index.ts`

### API routes (`apps/api/src/review.ts` + tests)
- `POST   /review-tasks`           — create task
- `GET    /review-tasks/:taskId`   — get task with pane data: fragments, content section, findings
- `POST   /review-tasks/:taskId/approvals`   — add approval (four-eyes check)
- `GET    /review-tasks/:taskId/approvals`   — list approvals
- `POST   /review-tasks/:taskId/comments`    — add immutable comment
- `GET    /review-tasks/:taskId/comments`    — list comments
- `POST   /claims/:claimId/decision`         — approve or reject claim; tenant isolation
- `router.ts` extended to mount review routes

### Web UI (`apps/web/app/`)
- `/review` — review queue page (list of NEEDS_REVIEW tasks)
- `/review/[taskId]` — three-pane review page: fragments | content | findings
- `/claims` — claim inspector page (list + approve/reject buttons)
- `/projects` — projects list page
- `/sources` — sources list page
- Layout navigation with explicit English labels
- No decorative motion (DIRECTIVE: motion in README only)
- Explicit English error messages inline

## Out of scope (Phase 7 only)
- Phase 8: rendering, build manifest
- Phase 9: release gate, export
- Phase 10: golden tests, scorecard

## Tests required by directive
1. `self-approval denied` — assertFourEyes throws when author == approver
2. `rejected claim blocks completion` — canCompleteReview returns false
3. `comment update denied` — SQL inspection: no UPDATE/DELETE on comments
4. `tenant isolation` — review task for tenant A not visible to tenant B mock

## Gate
```
pnpm typecheck
pnpm test
pnpm lint
```
All must exit 0.

## Commit order
1. `phase-7: review tables` — migration 006
2. `phase-7: review DB layer` — packages/db
3. `phase-7: claim approve/reject + four-eyes` — packages/domain
4. `phase-7: review contracts + API routes` — packages/contracts + apps/api
5. `phase-7: review UI` — apps/web
