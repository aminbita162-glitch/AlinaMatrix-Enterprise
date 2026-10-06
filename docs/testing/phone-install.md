# Phone Install — AlinaMatrix Enterprise

> **Enterprise Candidate — Active Development**
> No production claim is made. The app is installable as a PWA for testing on
> a phone; it is not a published app-store application.

This document describes how to install the AlinaMatrix Enterprise web app to
a phone home screen for testing. The app is a Progressive Web App (PWA): it
ships a `manifest.json`, an `icon.svg`, and a service worker (`/sw.js`). Add
to Home Screen opens the existing web app in a standalone window — the same
routes and the same status line as the browser.

The status line — **Enterprise Candidate — Active Development** — is visible
on the home screen and inside the standalone window. No production or
app-store claim is made.

## Prerequisites

1. The web app is reachable over **HTTPS** (service workers require HTTPS;
   `localhost` is exempt during local development).
2. The phone is on the same network as the dev machine, or the app is
   deployed to a HTTPS host.
3. The `manifest.json`, `icon.svg`, and `sw.js` are served from the app root
   (Next.js serves them from `apps/web/public/`).

## iOS Safari (iPhone / iPad)

1. Open **Safari** (not Chrome or Firefox on iOS — only Safari supports Add
   to Home Screen for PWAs).
2. Navigate to the app URL (e.g. `https://app.example.com` or
   `https://192.168.x.x:3000` for local dev).
3. Tap the **Share** button (square with an up arrow) in the bottom toolbar.
4. Scroll down and tap **Add to Home Screen**.
5. Edit the title if desired (default: **AlinaMatrix**) and tap **Add**.
6. The AlinaMatrix icon appears on the home screen. Tap it to open the app
   in a standalone window with no Safari chrome.
7. The status line badge (**Enterprise Candidate — Active Development**)
   is visible in the nav bar inside the standalone window.

### iOS limitations (honest)

- **No push notifications.** iOS PWAs cannot register a push endpoint in
  this build. No push test is included.
- **Service worker lifecycle.** iOS may delay service worker activation
  until the tab is closed and reopened. If the offline cache does not
  activate immediately, close the standalone app and reopen it.
- **Storage.** iOS limits origin storage to ~50 MB by default. The service
  worker caches the app shell only (`/`, `/manifest.json`, `/icon.svg`); it
  does not cache API responses or rendered artifacts.

## Android Chrome

1. Open **Chrome** (not Samsung Internet or Firefox — Chrome has the
   most complete PWA support on Android).
2. Navigate to the app URL.
3. Tap the **three-dot menu** (⋮) in the top-right corner.
4. Tap **Install app** (or **Add to Home screen** on older Chrome).
5. Confirm by tapping **Install**.
6. The AlinaMatrix icon appears on the home screen. Tap it to open the app
   in a standalone window.
7. The status line badge (**Enterprise Candidate — Active Development**)
   is visible in the nav bar inside the standalone window.

### Android limitations (honest)

- **No push notifications.** This build does not register a push endpoint.
  No push test is included.
- **Scope.** The manifest `scope` is `/`; only pages under `/` are
  installable. Sub-path routes (e.g. `/projects/123`) are inside scope.

## Verifying the install (both platforms)

After installing, open the standalone app and verify:

1. The **AlinaMatrix** nav bar appears at the top.
2. The status line badge reads **Enterprise Candidate — Active Development**.
3. The home page shows the positioning sentence: *Turn complex evidence into
   auditable professional artifacts.*
4. Navigation to `/projects`, `/sources`, `/claims`, `/review` works inside
   the standalone window.
5. Opening DevTools (if available) → Application → Service Workers shows
   `sw.js` as **activated and running**.

## What is NOT claimed

- **Not a native app.** This is a PWA installed from the browser; it is not
  an App Store or Play Store application.
- **No offline API.** The service worker caches the app shell for navigation
  resilience; it does not cache API responses or rendered artifacts. API
  calls require network.
- **No push notifications.** No push endpoint is registered.
- **Not production.** The status line remains **Enterprise Candidate —
  Active Development**.

---

Status: Enterprise Candidate — Active Development.
