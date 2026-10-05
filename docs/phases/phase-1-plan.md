# Phase 1 Plan — Repository Contract and Cinematic README

**Status:** Enterprise Candidate — Active Development  
**Phase:** 1 of 10  
**Scope:** Skeleton only. No database. No auth. No agent runtime.

---

## In-Scope Items

| # | Item | Notes |
|---|------|-------|
| 1 | pnpm workspace root | `package.json`, `pnpm-workspace.yaml`, `.npmrc` |
| 2 | TypeScript strict base config | `tsconfig.base.json` shared across all packages |
| 3 | ESLint flat config | TypeScript-aware, strict |
| 4 | Prettier config | consistent formatting |
| 5 | `.gitignore` | Node, pnpm, Next.js, OS artefacts |
| 6 | `apps/api` | Node HTTP server, `GET /health` → `{"status":"ok","version":"1.0.0","maturity":"enterprise-candidate"}` |
| 7 | `apps/web` | Next.js App Router, one page; status line exact; positioning sentence exact |
| 8 | `packages/domain` | Workflow state enum, illegal-transition guard, Vitest tests |
| 9 | `packages/db` | Stub package (no DB in Phase 1) |
| 10 | `packages/contracts` | Stub package |
| 11 | `packages/renderer` | Stub package |
| 12 | CI workflow | GitHub Actions: typecheck, test, lint on push/PR to main |
| 13 | `docs/adr/ADR-0001-beachhead-m03.md` | Architecture Decision Record |
| 14 | `docs/adr/ADR-0002-stack.md` | Stack decision record |
| 15 | `docs/adr/ADR-0003-determinism-and-honesty.md` | Determinism and honesty policy |
| 16 | `docs/security/threat-model-v0.md` | Initial threat model |
| 17 | `README.md` | Cinematic, animated SVG (SMIL/CSS), author block verbatim, honesty block, known limitations |

## Out-of-Scope (explicitly deferred)

- Database schema, migrations, RLS
- Authentication / sessions / cookies
- Agent runtime, LLM calls, DeterministicFakeProvider
- Object storage driver
- Any module other than M03 beachhead skeleton

## Gate

```
pnpm typecheck
pnpm test
pnpm lint
```

All three commands must exit 0. If any fails, the phase is **not** passed.

## Commit

Only after gate passes.  
Message: `phase-1: repository contract and cinematic README  -  gate passed`

---

*Residual risk: Gate cannot be executed in restricted environments without Node 22 and pnpm. If blocked, phase is not passed.*
