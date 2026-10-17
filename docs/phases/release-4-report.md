# Release 4 — Live Security Tests — Report

**Status:** Enterprise Candidate — Active Development

## Directive

> Against the deployed service: bad login, cross-tenant read, bad upload,
> rendered XSS. Record pass or fail. Do not close a threat-model item
> without a recorded live result. Update scorecard C4 only for a check
> this run closed. Gate exit 0. Stop.

## Deployed service — exact blocker

R4 requires live security tests against a deployed service. No deployed
service exists in this environment.

| Prerequisite        | Value                                         |
|---------------------|-----------------------------------------------|
| `DATABASE_URL`      | not set                                       |
| `SUPERUSER_URL`     | not set                                       |
| `RENDER_API_KEY`    | not set                                       |
| Local API (:3001)   | not running (`curl` returned 000)             |
| Local web (:3000)   | not running (`curl` returned 000)             |
| Render deploy       | not deployed — `render.yaml` is a blueprint   |

R2 recorded the same blocker: no Render account, no live PostgreSQL instance,
`render.yaml` has not been deployed. R4 cannot proceed past this blocker.

## Live security tests — not run

No live security test was run. No pass or fail was recorded for any of the
four checks:

| Check                | Live result | Reason                          |
|----------------------|-------------|----------------------------------|
| Bad login            | Not run     | No deployed service to test     |
| Cross-tenant read    | Not run     | No deployed service to test     |
| Bad upload           | Not run     | No deployed service to test     |
| Rendered XSS         | Not run     | No deployed service to test     |

No live result is invented. No threat-model item is closed. The four checks
remain open at the integration level.

## Scorecard C4 — unchanged

C4 ("Security coverage is unit-level only") stays **Open**. The directive says
"Update scorecard C4 only for a check this run closed." No check was closed
this run — no live result was recorded. The unit-level test coverage recorded
in the scorecard remains as-is. No change to `docs/release/scorecard.md`.

## Threat model — no closures

No threat-model item (T01–T12) is closed by this release. All items remain
open at the integration level. Unit-level test coverage for T01, T02, T03,
T05, T09, T10, T11 is recorded in `docs/release/scorecard.md` and remains
unchanged. No new live evidence is added.

## Gate

| Command          | Exit code |
|------------------|-----------|
| `pnpm typecheck` | 0         |
| `pnpm test`      | 0         |
| `pnpm lint`      | 0         |

All three exit 0.

## Requirements matrix

| R4 requirement                              | Status       | Evidence                              |
|---------------------------------------------|-------------|---------------------------------------|
| Bad login (live)                            | Not run     | No deployed service                   |
| Cross-tenant read (live)                    | Not run     | No deployed service                   |
| Bad upload (live)                           | Not run     | No deployed service                   |
| Rendered XSS (live)                         | Not run     | No deployed service                   |
| Record pass or fail                         | Blocked      | No deployed service; no live result   |
| Do not close threat-model item without live | Honored     | No item closed                        |
| Update scorecard C4 only for closed check   | Honored     | C4 stays Open; no change              |
| Gate exit 0                                 | Done         | typecheck, test, lint all exit 0      |
| Stop                                        | Done         | R5 not started                        |

## Residual risks

1. **No deployed service.** The Render Blueprint (`render.yaml`) has not been
   deployed. No Render account or live PostgreSQL instance is available in this
   environment. R4 cannot produce live security test results without a
   deployment.

2. **C4 stays Open.** Security coverage remains unit-level only. No integration
   or penetration test against a live deployment has been run. The overall
   scorecard verdict stays FAIL.

3. **Threat model open.** All twelve threat-model items (T01–T12) remain open
   at the integration level. Unit-level coverage does not close them.

4. **No invented result.** No live test result is fabricated. The blocker is
   recorded exactly as it exists: no deployed service, no live database, no
   live API endpoint.
