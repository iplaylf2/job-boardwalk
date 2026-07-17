# Browser Session

Browser Session is Job Boardwalk's long-lived loopback HTTP MCP service for a visible persistent
browser. It launches Patchright Chromium, owns the dedicated profile and browser process,
coordinates tabs and page actions, and derives authentication observations from top-level
navigation responses and bounded snapshots when a platform adapter has a conclusive rule. Page
meaning not covered by an adapter remains with the agent.

The dedicated profile survives service restarts and is never shared with another application.
Browser Session tools never read or return cookies, browser storage, or profile contents. Their
bounded page evidence lets the agent reconcile automation results with the window the user can see.

The current tool surface supports both BOSS直聘 and 鱼泡直聘 through one recruiting-platform adapter
contract. Shared tools do not imply identical access-assessment coverage: each adapter owns its
platform-specific navigation and authentication rules. A platform's HTTPS navigation scope permits
research navigation and explicit login-handoff preparation; it does not authorize login,
verification, or other account actions.

`browser_recommendation_snapshot` is the recommendation-page-specific read boundary. It accepts
the BOSS直聘 recommendation routes (`/web/geek/job-recommend` and the query-free
`/web/geek/jobs`) or a 鱼泡直聘 `/topic/a…c…/` intent feed. It returns bounded, deduplicated job-card
evidence without navigating, scrolling, clicking, opening details, or persisting jobs. Homepage
featured sections, query-bearing search pages, general job directories, and job-detail pages are
rejected. Workspace owns the selected intent and its platform source associations; the agent
compares that context with the live page evidence.

## Run Browser Session

Browser Session requires a graphical desktop session and Patchright's Chromium binary. It does not
require a particular operating system, shell, VM, container, or editor.

Install the browser once:

```sh
pnpm --filter @job-boardwalk/browser-session exec patchright install chromium
```

Then run the service:

```sh
pnpm --filter @job-boardwalk/browser-session dev
```

For a built run:

```sh
pnpm --filter @job-boardwalk/browser-session build
node apps/browser-session/dist/browser-session.js
```

By default, the dedicated browser profile is stored under the operating system's user data
directory. Set `JOB_BOARDWALK_BROWSER_PROFILE_PATH` to choose an exact path. Browser Session does
not share this path or profile with another service. Project entrypoints do not load `.env`
themselves.

## Endpoints and reporting

The Streamable HTTP MCP endpoint is <http://127.0.0.1:54312/mcp>; health is available at
<http://127.0.0.1:54312/health>. The service binds to loopback and rejects non-local browser origins,
but this is not authentication: local processes are inside the service trust boundary.

Every five seconds, Browser Session sends Workspace Service a bounded status report containing
browser availability, version, tab count, a generic failure summary when unavailable, and the
latest authentication observation, if any, derived by an adapter from browser navigation or a
requested snapshot. Detailed browser errors remain in the local process log. Set
`JOB_BOARDWALK_WORKSPACE_SERVICE_URL` when Workspace Service is not available at
<http://127.0.0.1:54310>. Reporting is best-effort: failures are retried and never stop browser
control.

### Platform adapter coverage

Both adapters use the same tab, navigation, snapshot, and login-handoff workflow. Their current
automatic access-assessment coverage differs:

| Platform | Automatic access assessment                                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BOSS直聘 | Successful protected navigation records `authenticated`; redirect from protected navigation to login records `unauthenticated`; a bounded snapshot containing the complete set of account-only navigation links records `authenticated`. |
| 鱼泡直聘 | A bounded snapshot whose header contains the message and resume navigation followed by a non-login account identity records `authenticated`.                                                                                             |

Navigation assessment is passive, and snapshot assessment reuses the page evidence already
requested by the agent. Browser Session sends no detection request and does not refresh or open a
page for this purpose. `browser_snapshot` returns `platformAccessObservation`; when it is non-null,
the same observation is already queued for the periodic Workspace Service report. A page loaded
before monitoring begins can therefore be assessed by a later snapshot without a separate agent
submission. The Dashboard still shows timestamped observations, not a timeless live authentication
guarantee.

## Runtime behavior

### Browser lifecycle

One top-level shajara scope owns the HTTP server, visible browser process, persistent context,
Workspace Service status reporter, recovery loops, and shutdown. If the browser window is closed
unexpectedly, Browser Session reports the interruption and launches it again with bounded
exponential backoff. It never replays a failed page action because the visible outcome may already
have occurred.

MCP actions, tab coordination, and snapshots run as `RiteCoroutine` routines. Patchright and Node
Promises are adapted with `until(...)` at the leaf SDK call; application-owned waits use shajara
primitives. Promise-returning adapters remain only at the HTTP, process-entry, and external-resource
boundaries.

Stopping Browser Session closes the browser it owns. The persistent profile retains ordinary client
state for the next service run.

### Tabs and page evidence

Tabs for BOSS直聘 and 鱼泡直聘 are discovered, selected, validated, and controlled through the same
adapter-driven workflow. `browser_tabs ensure` requires a `platformId` (`boss` or `yupao`), then
reuses a tab for that platform before creating one at its catalog entry URL. The service can list
and activate all in-scope tabs, but does not expose unconditional tab creation or a tab-close
action. The platform catalog owns each platform's label and web navigation metadata: its canonical
origin, navigation domain, and entry and login paths. Adapters derive destinations and the HTTPS
navigation boundary from that one contract. Page actions remain platform-independent.

Snapshots bound rendered text, element count, element names, and link lengths, and report any
clipping through `truncated`. They omit all form-control values and do not expose password controls.
Before using a ref, Browser Session verifies that the referenced element still matches the latest
snapshot. An explicit link outside the current tab's platform scope is rejected before clicking.
Clicking, filling, and selecting otherwise operate on the captured element without attempting to
classify its business purpose. The agent applies the user-handoff rules before login, verification,
application, message, or account actions.

Recommendation snapshots separately bound the number of job cards to 100 and return the card's
title, company, salary, location, tags, bounded card text, and same-platform detail link when the
page exposes those fields. The default limit is 50. The snapshot covers only job cards already
loaded into the current document; `truncated` reports clipping at the requested item limit.

`browser_prepare_login` is the explicit login-handoff preparation path. When the user asks to log
in, or visible page evidence shows that the requested workflow requires authentication and the
current session is unauthenticated, the agent uses this tool to reuse the platform tab and open its
catalog-defined login destination. The direct destination avoids rediscovering a page control on
every handoff. Once the login interface is visible, the agent stops browser input and hands the
same window to the user.

## Agent responsibility and handoff

The agent paces actions and interprets snapshot meaning not classified by an adapter. Entering
credentials, scanning a login QR code, completing verification, submitting the login form, applying
for jobs, sending messages, and changing an account remain under user control. The agent resumes
only after the user explicitly returns control and the live page is observed again.

## Maintenance constraints

The adapter registry is exhaustive over the catalog's `PlatformId` type. Adding a recruiting
platform therefore requires catalog metadata and a Browser Session adapter. Conclusive
platform-specific access rules belong in that adapter; interpretation that needs general page
meaning remains outside Browser Session.

Patchright replaces Playwright at the driver boundary because enabling the Runtime protocol domain
made BOSS navigate itself to `about:blank` during live testing. Patchright keeps the familiar page
API without enabling that domain. Browser Session also leaves console event collection disabled; do
not add Playwright or raw `Runtime.enable`/`Console.enable` calls alongside it.

## Development

Tests cover the public tool contract, URL and origin boundaries, bounded inputs, browser-context
behavior, and lifecycle ownership. Driver internals and reader-facing prose are not test contracts.

```sh
pnpm --filter @job-boardwalk/browser-session lint
pnpm --filter @job-boardwalk/browser-session typecheck
pnpm --filter @job-boardwalk/browser-session test
pnpm --filter @job-boardwalk/browser-session build
```
