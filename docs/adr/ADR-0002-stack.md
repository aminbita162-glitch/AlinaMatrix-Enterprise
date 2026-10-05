# ADR-0002 — Technology Stack

**Status:** Accepted  
**Date:** 2026-10-01  
**Author:** Amin Azimi, Azimi Innovation Lab  
**Project:** AlinaMatrix Enterprise 1.0.0  
**Maturity:** Enterprise Candidate — Active Development

---

## Context

AlinaMatrix Enterprise requires a stack that is:

1. Strictly typed to prevent a class of data integrity bugs at compile time.
2. Monorepo-friendly, with clear package boundaries between domain, database, contracts, and rendering.
3. Able to enforce RLS (row-level security) without application-layer complexity.
4. Auditable: reproducible builds, pinned dependencies, forward-only migrations.
5. Testable in CI without external service dependencies.

## Decision

| Layer | Technology | Rationale |
|---|---|---|
| Language | TypeScript strict, Node 22 | Strict typing; Node 22 LTS for stability |
| Package manager | pnpm workspaces | Deterministic installs; workspace protocol |
| Web | Next.js App Router (`apps/web`) | React Server Components; no custom framework |
| API | Node HTTP (`apps/api`) | Minimal; no framework dependency in Phase 1 |
| Domain | `packages/domain` | Pure TypeScript; no runtime dependency |
| Database | PostgreSQL 16 with RLS | Tenant isolation enforced at DB layer (Phase 2+) |
| Cache / Queue | Redis 7 | Fast ephemeral state; job queuing (Phase 5+) |
| Object storage | Local filesystem driver (dev/test) | No cloud vendor lock-in in beachhead |
| Validation | zod at all boundaries | Runtime type safety; schema-first |
| Password hashing | argon2id | Current best practice |
| IDs | UUID server-side | No client-controlled identity |
| Time | UTC storage only | Consistent audit timestamps |
| Migrations | SQL, forward-only | Immutable audit trail; no down migrations |
| Testing | Vitest | Fast; native ESM; TypeScript-native |
| CI | GitHub Actions | Standard; no proprietary CI vendor |
| Lint/Format | ESLint + Prettier | Consistent code style; enforced in CI |

## Rejected alternatives

- **Prisma ORM**: hides SQL; RLS enforcement is harder to reason about.
- **Drizzle**: immature at time of decision; may be reconsidered via ADR.
- **Bun**: not yet LTS-stable enough for enterprise candidate posture.
- **Any fashionable replacement framework**: explicitly prohibited by DIRECTIVE.

## Consequences

**Positive:**
- Bounded, auditable dependencies.
- No proprietary SaaS vendor required for dev or test.
- Full stack is reproducible from a clean checkout.

**Negative:**
- More boilerplate in `apps/api` than a framework would require.
- Local object storage driver must be replaced before any production deployment.

**Residual risk:**
- PostgreSQL 16 RLS is not exercised until Phase 2. Tenant isolation is not proven in Phase 1.
- Redis 7 is not installed or exercised until Phase 5.

## Open blockers

- None at Phase 1.
