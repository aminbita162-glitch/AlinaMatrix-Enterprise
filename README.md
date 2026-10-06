# AlinaMatrix Enterprise

> **Enterprise Candidate — Active Development**  
> No production claim is made. Beachhead M03 is not yet proven.

---

<!-- ANIMATED SVG: Evidence-to-Artifact Flow — AlinaArchitect · AlinaGuard · AlinaDocEngine · AlinaOptimizer -->
<!-- Static fallback paragraph follows the SVG for environments where animation does not play. -->

<p align="center">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 320" width="900" height="320" role="img" aria-label="AlinaMatrix evidence-to-artifact flow: four agents transforming source evidence into an auditable artifact">
  <defs>
    <style>
      .bg { fill: #0a0a0f; }
      .lane { fill: none; stroke: #1e1e2e; stroke-width: 1; }
      .node-box { rx: 6; ry: 6; fill: #12121f; stroke-width: 1.5; }
      .node-label { font-family: ui-monospace, monospace; font-size: 11px; fill: #e2e8f0; text-anchor: middle; dominant-baseline: middle; }
      .agent-label { font-family: ui-monospace, monospace; font-size: 9px; fill: #94a3b8; text-anchor: middle; }
      .caption { font-family: ui-monospace, monospace; font-size: 10px; fill: #475569; text-anchor: middle; }
      .arrow { fill: none; stroke-width: 1.5; stroke-linecap: round; }

      /* Pulse on each node */
      @keyframes pulse-architect  { 0%,100%{opacity:.35} 20%,80%{opacity:1} }
      @keyframes pulse-guard      { 0%,100%{opacity:.35} 40%,80%{opacity:1} }
      @keyframes pulse-docengine  { 0%,100%{opacity:.35} 60%,80%{opacity:1} }
      @keyframes pulse-optimizer  { 0%,100%{opacity:.35} 80%,100%{opacity:1} }

      .architect  { animation: pulse-architect  3.6s ease-in-out infinite; }
      .guard      { animation: pulse-guard      3.6s ease-in-out infinite; }
      .docengine  { animation: pulse-docengine  3.6s ease-in-out infinite; }
      .optimizer  { animation: pulse-optimizer  3.6s ease-in-out infinite; }

      /* Moving evidence particle */
      @keyframes travel {
        0%   { transform: translateX(0px);   opacity: 0; }
        5%   { opacity: 1; }
        95%  { opacity: 1; }
        100% { transform: translateX(680px); opacity: 0; }
      }
      .particle { animation: travel 3.6s linear infinite; }

      /* Glow border animation */
      @keyframes glow-a { 0%,100%{stroke:#7c5cd8;stroke-opacity:.4} 20%{stroke:#a78bfa;stroke-opacity:1} }
      @keyframes glow-g { 0%,100%{stroke:#3b82f6;stroke-opacity:.4} 40%{stroke:#60a5fa;stroke-opacity:1} }
      @keyframes glow-d { 0%,100%{stroke:#10b981;stroke-opacity:.4} 60%{stroke:#34d399;stroke-opacity:1} }
      @keyframes glow-o { 0%,100%{stroke:#f59e0b;stroke-opacity:.4} 80%{stroke:#fbbf24;stroke-opacity:1} }

      .box-a { animation: glow-a 3.6s ease-in-out infinite; }
      .box-g { animation: glow-g 3.6s ease-in-out infinite; }
      .box-d { animation: glow-d 3.6s ease-in-out infinite; }
      .box-o { animation: glow-o 3.6s ease-in-out infinite; }
    </style>

    <marker id="ah" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="#334155"/>
    </marker>
  </defs>

  <!-- Background -->
  <rect class="bg" width="900" height="320"/>

  <!-- Horizontal pipeline rail -->
  <line x1="90" y1="160" x2="810" y2="160" stroke="#1e1e2e" stroke-width="2"/>

  <!-- Source node -->
  <g transform="translate(50,160)">
    <rect class="node-box" x="-40" y="-22" width="80" height="44" stroke="#334155"/>
    <text class="node-label" y="-6">SOURCE</text>
    <text class="node-label" y="8" style="font-size:9px;fill:#475569">evidence</text>
  </g>

  <!-- AlinaArchitect -->
  <g class="architect" transform="translate(230,160)">
    <rect class="node-box box-a" x="-62" y="-30" width="124" height="60"/>
    <text class="node-label" y="-10">AlinaArchitect</text>
    <text class="agent-label" y="6">READ_SOURCE</text>
    <text class="agent-label" y="18">WRITE_DRAFT</text>
  </g>

  <!-- AlinaGuard -->
  <g class="guard" transform="translate(430,160)">
    <rect class="node-box box-g" x="-55" y="-30" width="110" height="60"/>
    <text class="node-label" y="-10">AlinaGuard</text>
    <text class="agent-label" y="6">READ_EVIDENCE</text>
    <text class="agent-label" y="18">RUN_VALIDATION</text>
  </g>

  <!-- AlinaDocEngine -->
  <g class="docengine" transform="translate(620,160)">
    <rect class="node-box box-d" x="-62" y="-30" width="124" height="60"/>
    <text class="node-label" y="-10">AlinaDocEngine</text>
    <text class="agent-label" y="6">COMPILE</text>
    <text class="agent-label" y="18">ARTIFACT</text>
  </g>

  <!-- AlinaOptimizer (above rail) -->
  <g class="optimizer" transform="translate(430,60)">
    <rect class="node-box box-o" x="-60" y="-24" width="120" height="48"/>
    <text class="node-label" y="-8">AlinaOptimizer</text>
    <text class="agent-label" y="6">READ_USAGE</text>
    <text class="agent-label" y="18">WRITE_CACHE</text>
  </g>

  <!-- Artifact node -->
  <g transform="translate(850,160)">
    <rect class="node-box" x="-38" y="-22" width="76" height="44" stroke="#334155"/>
    <text class="node-label" y="-6">ARTIFACT</text>
    <text class="node-label" y="8" style="font-size:9px;fill:#475569">auditable</text>
  </g>

  <!-- Connector arrows -->
  <line class="arrow" x1="92"  y1="160" x2="166" y2="160" stroke="#334155" marker-end="url(#ah)"/>
  <line class="arrow" x1="294" y1="160" x2="373" y2="160" stroke="#334155" marker-end="url(#ah)"/>
  <line class="arrow" x1="487" y1="160" x2="556" y2="160" stroke="#334155" marker-end="url(#ah)"/>
  <line class="arrow" x1="684" y1="160" x2="810" y2="160" stroke="#334155" marker-end="url(#ah)"/>

  <!-- Optimizer feedback arc -->
  <path class="arrow" d="M430,84 Q430,120 430,130" stroke="#f59e0b" stroke-opacity="0.5" marker-end="url(#ah)"/>

  <!-- Moving particle (evidence token travelling the pipeline) -->
  <g class="particle" transform="translate(90,160)">
    <circle r="5" fill="#7c5cd8" opacity="0.9"/>
    <circle r="9" fill="none" stroke="#7c5cd8" stroke-width="1" opacity="0.4"/>
  </g>

  <!-- Caption -->
  <text class="caption" x="450" y="292">
    Evidence flows left to right. AlinaOptimizer observes usage and maintains cache metadata.
  </text>
  <text class="caption" x="450" y="308">
    Human review and release gate sit between AlinaGuard and AlinaDocEngine (Phase 7).
  </text>
</svg>
</p>

**Motion caption:** A single evidence token (purple pulse) travels from a raw source through
AlinaArchitect (plan), AlinaGuard (validation), and AlinaDocEngine (compilation) to produce
an auditable artifact. AlinaOptimizer observes the flow from above, reading usage and maintaining
cache metadata. Agents glow in sequence as control passes through them.

**Static fallback:** AlinaMatrix Enterprise routes source documents through four agents in a
controlled pipeline. AlinaArchitect reads sources and writes a draft plan.
AlinaGuard validates evidence, quote-locks, and checks for contradictions.
AlinaDocEngine compiles the approved content model into a rendered artifact.
AlinaOptimizer reads usage data and manages cache metadata.
Human review and a four-eyes release gate are required before any artifact is published.

---

## What is AlinaMatrix Enterprise?

AlinaMatrix Enterprise is a professional AI document engineering and evidence-control platform
designed for expert users who require structured synthesis, provenance, validation, reproducible
artifact generation and controlled human review.

**Product sentence:** Turn complex evidence into auditable professional artifacts.

---

## Author

| Field | Value |
|---|---|
| Lead AI Architect | Amin Azimi |
| Focus | End-to-End System Development and Business Challenge Architecture |
| Innovation Lab | Azimi Innovation Lab |
| Project Version | 1.0.0 |
| Project Start Date | October 2026 |

---

## Repository Structure

```
apps/
  api/          Node HTTP API  (GET /health in Phase 1)
  web/          Next.js App Router (status page in Phase 1)
packages/
  domain/       Workflow states, illegal-transition guard, tests
  db/           PostgreSQL client and migrations (Phase 2+)
  contracts/    Zod API contracts (Phase 2+)
  renderer/     HTML artifact renderer (Phase 8+)
docs/
  adr/          Architecture Decision Records
  phases/       Phase plans and gate reports
  security/     Threat model
.github/
  workflows/    CI: typecheck, test, lint
```

---

## Status

**Enterprise Candidate — Active Development**

The CI gate (`pnpm typecheck && pnpm test && pnpm lint`) must exit 0 before any commit.
Phase reports list actual exit codes, actual test counts, and any failures without suppression.

---

## Known Limitations

- **Beachhead not yet proven.** M03 pipeline is scaffolded; end-to-end execution
  requires a live PostgreSQL instance. No production claim is made.
- **Integration tests skipped.** 101 integration tests require a live PostgreSQL
  instance with `DATABASE_URL` and `SUPERUSER_URL` set. They are skipped — not
  failed, not passed.
- **No PDF output.** PDF rendering is not built — no local pinned offline renderer
  is available. `renderPdf()` returns `status: "not_built"` with a visible English
  reason. No fake PDF bytes are emitted.
- **No live LLM.** All agent outputs use DeterministicFakeProvider (R07). No real
  model call has been made. Determinism is structural, not semantic.
- **Security coverage is unit-level.** Auth bypass, authz bypass, tenant breach,
  prompt injection, bad upload, XSS, and SQL injection are covered by unit tests
  with mock doubles — not by live integration tests.
- **No regional disaster recovery.** No DR site, no cross-region replication. The
  backup runbook (`docs/runbooks/backup-restore.md`) and drill script
  (`scripts/backup-drill.sh`) are local procedures only.
- **Local object storage only.** A production object storage backend is not included.
- **M03 ADR only.** No other document type is produced. Modules M01–M02 and M04–M30
  are deferred.
- **All twelve threat-model items are open.** See `docs/security/threat-model-v0.md`.

## Claims Audit (Phase 10)

Every claim in this README is audited against evidence in the repository.

| Claim | Evidence | Status |
|-------|---------|--------|
| "Enterprise Candidate — Active Development" | Status line in DIRECTIV.txt H02; all phase reports; README header | Verified |
| "Turn complex evidence into auditable professional artifacts." | Product sentence in DIRECTIV.txt FROZEN DECISIONS; `packages/contracts/src/m03.ts` M03MetadataSchema | Verified |
| Four agents: AlinaArchitect, AlinaGuard, AlinaDocEngine, AlinaOptimizer | `packages/domain/src/agents.ts` AGENT_CAPABILITIES; `packages/domain/src/agents.test.ts` — exactly four agents | Verified |
| No live LLM (DeterministicFakeProvider) | `packages/domain/src/agents.ts` DeterministicFakeProvider; `packages/domain/src/agents.test.ts` — no I/O | Verified |
| No production-ready claim | No "production-ready" string in any file; H01 forbids it | Verified |
| PDF not built | `packages/renderer/src/pdf.ts` — `renderPdf()` returns `status: "not_built"` | Verified |
| Integration tests skipped | `packages/db/src/*.integration.test.ts` — skipped without DATABASE_URL | Verified |
| Beachhead is M03 only | `docs/adr/ADR-0001-beachhead-m03.md`; DIRECTIV.txt FROZEN DECISIONS | Verified |
| No invented DOI/PMID/ISBN | No DOI/PMID/ISBN fields in any schema; DIRECTIV.txt H06 forbids it | Verified |
| Backup drill script exists | `scripts/backup-drill.sh` | Verified |
| Release scorecard exists | `docs/release/scorecard.md` | Verified |
| Expert acceptance protocol exists | `docs/eval/expert-acceptance-protocol.md` (blank scores) | Verified |

---

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | Repository Contract and Cinematic README | Complete |
| 2 | Identity, Tenancy, RLS, Audit | Complete |
| 3 | Immutable Source and Fragments | Complete |
| 4 | Claim Atoms and Provenance | Complete |
| 5 | Jobs, Four Agent Contracts, Fake Provider | Complete |
| 6 | M03 Architect, Generate, Guard | Complete |
| 7 | Human Review | Complete |
| 8 | Renderer and Build Manifest | Complete |
| 9 | Release Gate, Export, Budget | Complete |
| 10 | Evaluation Evidence and Honest Scorecard | Complete |

---

**(C) 2026 Amin Azimi — Azimi Innovation Lab. All Rights Reserved.**  
*AlinaMatrix Enterprise — Enterprise Candidate — Active Development.*
