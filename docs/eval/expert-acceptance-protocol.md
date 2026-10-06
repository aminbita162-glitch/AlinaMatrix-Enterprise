# Expert Acceptance Protocol — AlinaMatrix Enterprise

Status: Enterprise Candidate — Active Development

> No production claim is made. This protocol contains blank scores.
> Scores must be filled by a qualified expert reviewer after hands-on
> evaluation. No score is pre-filled or assumed.

## Instructions for the reviewer

1. Run the full gate: `pnpm typecheck && pnpm test && pnpm lint`
2. Review the golden fixtures in `packages/domain/src/golden-fixtures.ts`
3. Review the release scorecard in `docs/release/scorecard.md`
4. Review the threat model in `docs/security/threat-model-v0.md`
5. Review the backup runbook in `docs/runbooks/backup-restore.md`
6. Attempt the security scenarios listed below
7. Fill in each score (0–5) and evidence field
8. Any score of 0 on a critical item forces an overall FAIL

## Scoring scale

| Score | Meaning |
|-------|---------|
| 0 | Not covered — no test or evidence |
| 1 | Failed — a test exists but it fails |
| 2 | Weak — partial coverage, gaps remain |
| 3 | Adequate — covers the scenario but not edge cases |
| 4 | Strong — comprehensive coverage with edge cases |
| 5 | Excellent — comprehensive, audited, and independently verified |

## Evaluation items

### 1. M03 pipeline correctness

| Item | Score (0–5) | Evidence |
|------|-------------|----------|
| Happy ADR passes the guard | __ | |
| Contradiction forces NEEDS_REVIEW | __ | |
| Prompt injection does not change the plan | __ | |
| Missing citation is rejected | __ | |
| Unit mismatch is flagged (no auto-correct) | __ | |
| Cross-tenant cache miss | __ | |

### 2. Release gate

| Item | Score (0–5) | Evidence |
|------|-------------|----------|
| Validations must pass | __ | |
| Critical findings must be 0 | __ | |
| Four-eyes approval required | __ | |
| Manifest and checksum required | __ | |
| Source versions and version pins required | __ | |
| Source job must not be failed or cancelled | __ | |

### 3. Budget breaker

| Item | Score (0–5) | Evidence |
|------|-------------|----------|
| Over budget does not call the provider | __ | |
| Budget breach returns a reason | __ | |
| Bigint precision (past 2^53) | __ | |

### 4. Revocation

| Item | Score (0–5) | Evidence |
|------|-------------|----------|
| Revoke writes an event | __ | |
| Revoke does not mutate published bytes | __ | |
| Revocation event is append-only | __ | |

### 5. Export

| Item | Score (0–5) | Evidence |
|------|-------------|----------|
| Export without permission denied | __ | |
| Watermark intact before export | __ | |
| Export audit is append-only | __ | |

### 6. Renderer

| Item | Score (0–5) | Evidence |
|------|-------------|----------|
| Replay determinism (same inputs → same HTML sha256) | __ | |
| No invented claim in HTML | __ | |
| Unknown assertion keys dropped | __ | |
| Manifest pins present | __ | |
| PDF not built (honestly) | __ | |

### 7. Security

| Item | Score (0–5) | Evidence |
|------|-------------|----------|
| Auth bypass (T01) | __ | |
| Authz bypass (T02) | __ | |
| Tenant breach (T03) | __ | |
| Prompt injection (T05) | __ | |
| Bad upload (T11) | __ | |
| XSS in rendered HTML (T09) | __ | |
| SQL injection (T10) | __ | |

### 8. Backup and restore

| Item | Score (0–5) | Evidence |
|------|-------------|----------|
| Backup procedure documented | __ | |
| Restore procedure documented | __ | |
| Drill script exists | __ | |
| Drill script run against live database | __ | |
| Regional disaster recovery | __ | |

### 9. Honesty and limitations

| Item | Score (0–5) | Evidence |
|------|-------------|----------|
| Status line is "Enterprise Candidate — Active Development" | __ | |
| No production-ready claim | __ | |
| Open limitations listed | __ | |
| Pre-launch blockers listed | __ | |
| No invented citations, scores, or credentials | __ | |

## Overall verdict

| Field | Value |
|-------|-------|
| Reviewer name | __ |
| Reviewer role | __ |
| Review date | __ |
| Overall score | __ / 5 |
| Verdict | __ (PASS / FAIL / CONDITIONAL) |
| Critical blockers | __ (list any) |
| Conditions | __ (list any) |

> Any open critical blocker forces FAIL. Do not average it away.

## Open limitations (declared honestly per H05)

1. **Integration tests skipped.** 101 integration tests require a live
   PostgreSQL instance and are skipped without `DATABASE_URL`.
2. **PDF not built.** No local pinned offline PDF renderer is available.
3. **No live LLM.** All agent outputs use DeterministicFakeProvider (R07).
4. **Security coverage is unit-level.** Mock doubles, not live integration.
5. **No regional disaster recovery.** Not implemented, not claimed.
6. **Drill script not run against a live database.** Procedure only.

No production claim is made. Do not deploy as a production system.
