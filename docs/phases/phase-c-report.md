# Phase C Report — Phone Test Surface

> **Enterprise Candidate — Active Development**
> No production claim is made.

## Directive

Phase C of `DIRECTIV.txt` (follow-on): PWA manifest and service worker for
`apps/web`. Add to Home Screen opens the existing web app. Status line
visible. `docs/testing/phone-install.md` for iOS Safari and Android Chrome.
Gate exit 0. Stop.

## Scope

| Item | In scope | Status |
|------|----------|--------|
| PWA manifest (`manifest.json`) | yes | built |
| Service worker (`/sw.js`) | yes | built |
| App icon (`icon.svg`) | yes | built |
| Layout wiring (manifest link, viewport, theme color, apple-web-app) | yes | built |
| Service worker registration component | yes | built |
| `docs/testing/phone-install.md` (iOS Safari + Android Chrome) | yes | built |
| Phase D (provenance and trace) | no | not started |

## Deliverables

### Unit 1 — PWA surface (commit `3d6a9df`)

- `apps/web/public/manifest.json` — PWA manifest: `name`, `short_name`,
  `description`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`,
  `background_color` and `theme_color` set to `#0a0a0f`, one `icon.svg`
  entry (`sizes: "any"`, `purpose: "any maskable"`).
- `apps/web/public/icon.svg` — 512×512 SVG icon: dark rounded-rect
  background, `AM` monogram in the brand purple (`#7c5cd8`), `Enterprise`
  subtitle. No PNG raster; SVG scales to any density.
- `apps/web/public/sw.js` — service worker: caches the app shell
  (`/`, `/manifest.json`, `/icon.svg`) on install, `skipWaiting` +
  `clients.claim` for activation, stale-cache cleanup on activate, and a
  network-first / cache-fallback fetch handler that only caches same-origin
  GET responses. No push, no background sync.
- `apps/web/app/ServiceWorkerRegister.tsx` — client component that
  registers `/sw.js` when `navigator.serviceWorker` is available. No-op on
  SSR or unsupported browsers. Rendered once in the root layout body.
- `apps/web/app/layout.tsx` — `metadata.manifest`, `metadata.applicationName`,
  `metadata.appleWebApp` (capable, status bar, title), `metadata.icons`
  (icon + apple), and a `viewport` export (`width: "device-width"`,
  `initialScale: 1`, `themeColor: "#0a0a0f"`). The
  `<ServiceWorkerRegister />` is rendered inside `<body>`.

Commit: `follow-on-C: PWA manifest, service worker, icon, layout wiring - gate passed`

### Unit 2 — Phone install documentation (commit `fa58571`)

- `docs/testing/phone-install.md` — step-by-step Add to Home Screen
  instructions for iOS Safari and Android Chrome, prerequisites (HTTPS),
  per-platform limitations (no push, storage limits, SW lifecycle), a
  verification checklist (nav bar, status line badge, standalone window,
  service worker active), and an explicit "What is NOT claimed" section
  (not a native app, no offline API, no push, not production). The status
  line — **Enterprise Candidate — Active Development** — is documented as
  visible on the home screen and inside the standalone window.

Commit: `follow-on-C: phone-install doc (iOS Safari + Android Chrome) - gate passed`

## Gate

```bash
cd ~/AlinaMatrix-Enterprise
pnpm typecheck   # pnpm -r typecheck — all packages
pnpm test        # pnpm -r test — Vitest per package
pnpm lint        # eslint . --max-warnings 0
```

| Command | Exit code |
|---------|-----------|
| `pnpm typecheck` | 0 |
| `pnpm test` | 0 |
| `pnpm lint` | 0 |

### Test counts

| Package | Tests passed | Tests skipped |
|---------|-------------|---------------|
| apps/api | 90 | 0 |
| packages/domain | 283 | 0 |
| packages/renderer | 80 | 0 |
| packages/db | 266 | 101 |
| apps/web | (no Vitest suite — `echo` stub) | 0 |

**Total executed: 719 passed.**
**Total skipped: 101** (integration tests requiring live PostgreSQL; not
failed, not passed — same as Phase A/B).

## Requirements matrix

| Directive requirement | How met |
|------------------------|---------|
| PWA manifest for `apps/web` | `apps/web/public/manifest.json` + layout `metadata.manifest` |
| Service worker for `apps/web` | `apps/web/public/sw.js` + `ServiceWorkerRegister.tsx` |
| Add to Home Screen opens the existing web app | `start_url: "/"`, `scope: "/"`, `display: "standalone"`; no new route added |
| Status line visible | status line badge in `NavBar` (unchanged); `theme_color` and `background_color` match the app; documented in `phone-install.md` |
| `docs/testing/phone-install.md` for iOS Safari and Android Chrome | written with per-platform steps, limitations, and a verification checklist |
| Gate exit 0 | `pnpm typecheck`, `pnpm test`, `pnpm lint` all exit 0 |
| English only | all source, comments, docs, and UI text are English |

## Residual risks / honest limitations

- **Not a native app.** This is a PWA installed from the browser; it is not
  an App Store or Play Store application. No app-store submission is made
  or claimed.
- **No push notifications.** The service worker does not register a push
  endpoint. No push test is included. This is an honest limitation, not a
  deferred TODO.
- **Offline scope is the app shell only.** `sw.js` caches `/`,
  `/manifest.json`, and `/icon.svg` for navigation resilience. API
  responses and rendered artifacts are **not** cached; they require network.
- **No live phone test.** The gate is `pnpm typecheck; pnpm test; pnpm
  lint` — it does not exercise a physical phone. The install instructions
  are documentation; no automated test verifies Add to Home Screen on a
  device.
- **iOS SW lifecycle.** iOS may delay service worker activation until the
  tab is closed and reopened; documented in `phone-install.md`.
- **Icon is SVG only.** Some older Android launchers may not render an
  SVG maskable icon at all densities. No PNG raster fallback is included;
  the manifest declares `sizes: "any"`.

## Phase D not started

Phase D (provenance and trace) is out of scope. No Phase D code, migration,
or test was written. Stopped at the Phase C gate.

---

Status: Enterprise Candidate — Active Development.
