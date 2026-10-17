# AlinaMatrix Enterprise — Design System

Mission Blueprint style. Dark self-contained presentation layer.

> **Enterprise Candidate — Active Development**
> No production claim is made. Beachhead M03 is not yet proven.

---

## Tokens

| Token | Hex | Usage |
|---|---|---|
| `--bg-deep` | `#0A0F1A` | Deepest background — page canvas behind all panels |
| `--bg-panel` | `#0F1726` | Panel background — primary container surface |
| `--bg-raise` | `#14203A` | Raised surface — cards, boxes, elevated elements |
| `--grid-minor` | `#12304F` | Minor grid lines — fine background texture |
| `--grid-major` | `#1B4B7A` | Major grid lines — structural background divisions |
| `--line-primary` | `#3FA9F5` | Primary lines — connectors, borders, emphasis strokes |
| `--line-soft` | `#2A6FA8` | Soft lines — secondary connectors, subtle borders |
| `--signal-cyan` | `#5EEAD4` | Signal: cyan — information, data flow |
| `--signal-green` | `#34D399` | Signal: green — success, pass, verified |
| `--signal-amber` | `#F5A524` | Signal: amber — warning, attention, pending |
| `--signal-red` | `#F87171` | Signal: red — error, rejection, blocked |
| `--text-primary` | `#E6EDF3` | Primary text — headings, labels, body |
| `--text-muted` | `#8B9BB0` | Muted text — secondary descriptions, captions |
| `--text-faint` | `#5B6B80` | Faint text — tertiary metadata, grid labels |

---

## Presentation Rules

- **Dark, self-contained SVG panels.** Every diagram is a standalone SVG
  with all styles inline. No external font, image, script, or CSS reference.
- **No external dependencies.** No `<script>`, `foreignObject`, event
  handlers, `iframe`, `object`, `embed`, or `http`/`https` `href` in any SVG.
- **Animation inside SVG only.** CSS `@keyframes` and SMIL are permitted
  inside the SVG document. `prefers-reduced-motion` must be respected —
  animations must pause or reduce when the media query matches.
- **No fake badges.** No fake ONLINE, LIVE, percent, or compliance badge.
  The status line is the only status: **Enterprise Candidate — Active Development**.

---

## Station Grid

2×2 grid of four agents (official names only):

| Position | Code | Name |
|---|---|---|
| Top-left | ST-01 | AlinaArchitect |
| Top-right | ST-02 | AlinaGuard |
| Bottom-left | ST-03 | AlinaDocEngine |
| Bottom-right | ST-04 | AlinaOptimizer |

Codes are labels only. Official names stay.

---

## Assets

All assets live under `docs/assets/readme/`:

| File | Purpose |
|---|---|
| `hero.svg` | Hero panel — evidence-to-artifact flow overview |
| `blueprint-architecture.svg` | System architecture blueprint |
| `station-01-architect.svg` | ST-01 AlinaArchitect panel |
| `station-02-guard.svg` | ST-02 AlinaGuard panel |
| `station-03-docengine.svg` | ST-03 AlinaDocEngine panel |
| `station-04-optimizer.svg` | ST-04 AlinaOptimizer panel |
| `handoff-flow.svg` | Station handoff flow diagram |
| `divider.svg` | Section divider |

---

## Status Line

Exact, unchanged, in every context:

> **Enterprise Candidate — Active Development**

Candidate stays until real deployment and real use. A small test count is
not proof of real-world capacity.
