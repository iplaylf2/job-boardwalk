# Browser Session

Browser Session is Job Boardwalk's long-lived loopback HTTP MCP service for a visible persistent
browser. It launches Patchright Chromium, owns the dedicated profile and browser process,
coordinates tabs and page actions, and derives authentication observations from top-level
navigation responses and bounded snapshots when a platform adapter has a conclusive rule. Page
meaning not covered by an adapter remains with the agent.

Browser Session is a host companion by design. It runs in the same graphical session the user can
observe and take over; it is not part of the Compose deployment. Workspace Service and Dashboard
run in containers, while Workspace Service's loopback-published port preserves the existing local
HTTP relationship without giving either container access to the browser profile or desktop.

The dedicated profile survives service restarts and is never shared with another application.
Browser Session tools never read or return cookies, browser storage, or profile contents. Their
bounded page evidence lets the agent reconcile automation results with the window the user can see.

The current tool surface supports both BOSS直聘 and 鱼泡直聘 through one recruiting-platform adapter
contract. Shared tools do not imply identical access-assessment coverage: each adapter owns its
platform-specific navigation and authentication rules. A platform's HTTPS navigation scope permits
research navigation and explicit login-handoff preparation; it does not authorize login,
verification, or other account actions.

## Job-card reads and passive collection

`browser_job_card_snapshot` is the structured job-card read boundary. It accepts any page inside
BOSS直聘 or 鱼泡直聘's supported HTTPS navigation scope and returns bounded, deduplicated job-card
evidence already present in that document without navigating, scrolling, clicking, opening
details, or persisting jobs. A page with no recognizable cards returns an empty card collection.
Workspace Service owns the selected intent and its platform recommendation seed pages; the agent
compares that context with live page evidence when judging relevance.

A passive collector reuses this bounded reader. It reads the selected job-search intent from
Workspace Service and maintains an associated tab for each recommendation seed. It first adopts an
already-open exact URL or creates a tab for the seed. While that tab remains open, the association
survives login, verification, and canonical redirects, so later passes do not repeatedly open the
requested URL or replace the redirected page. Other tabs remain untouched.

The collector then observes every open supported-platform tab immediately and every 30 seconds and
submits every recognizable card currently loaded in those documents to Workspace Service without
scrolling, clicking, or opening details. The tab's association, current route, apparent purpose,
and semantic relevance do not suppress recognizable cards. A document with no recognizable cards
produces no job observations. This captures related search results and other discovery surfaces
reached during directed research instead of treating the recommendation feed as the storage
boundary.

Without a selected intent, passive collection still observes supported platform tabs that are
already open, but it does not open recommendation seed pages. A selected intent supplies those
seeds; it does not limit which open platform tabs can contribute cards. Repeated observations let
Workspace Service skip unchanged records and update facts when visible cards change; no agent call
is required. A page that closes or navigates during its bounded read is reported and skipped
without discarding jobs collected from other tabs. A Workspace Service write failure stops the
current pass and is retried on the next pass. The same bounded DOM pass refreshes any conclusive
platform-access evidence.

## Job-interest synchronization

Browser Session independently observes the jobs the user has marked “感兴趣” on each platform. It
maintains one tab per platform, reusing an already-open interest list or opening it when necessary.
The tab association survives a redirect, preventing each collection pass from opening another
login or verification tab. Only the corresponding interest-list document produces a bounded
snapshot; a redirected document remains eligible for the general job-card collector but is not
treated as evidence that the user marked its cards “感兴趣”. Workspace Service merges snapshots of
at most 200 visible entries into the job library and updates the interest relations on their
platform sources every 30 seconds. This collector does not depend on a selected search intent.

BOSS直聘 exposes ordinary job-detail links on this page. 鱼泡直聘 currently renders the account
cards without ordinary links, so its records retain the visible job facts while omitting `jobUrl`.
Only a non-truncated read whose extracted-card count matches a visible platform total is complete.
A complete snapshot replaces absent relations; a partial snapshot only adds or refreshes the
relations it observed. The collector never marks or unmarks a job, and removing a relation does not
remove the job from the library.

## Run Browser Session

Browser Session requires a graphical desktop session and Patchright's Chromium binary. It does not
require a particular operating system, shell, VM, or editor, but it must not run in the headless
service containers because the visible host window is the user-handoff boundary.

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
pnpm --filter @job-boardwalk/browser-session start
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
bounded page read. Detailed browser errors remain in the local process log. Set
`JOB_BOARDWALK_WORKSPACE_SERVICE_URL` when Workspace Service is not available at
<http://127.0.0.1:54310>. Reporting is best-effort: failures are retried and never stop browser
control.

Job-card submission uses the same Workspace Service URL. A failed submission is reported locally
and retried by the next bounded collection pass without stopping browser control.

### Platform adapter coverage

Both adapters use the same tab, navigation, snapshot, and login-handoff workflow. Their current
automatic access-assessment coverage differs:

| Platform | Automatic access assessment                                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BOSS直聘 | Successful protected navigation records `authenticated`; redirect from protected navigation to login records `unauthenticated`; a bounded snapshot containing the complete set of account-only navigation links records `authenticated`. |
| 鱼泡直聘 | A bounded snapshot whose header contains the message and resume navigation followed by a non-login account identity records `authenticated`.                                                                                             |

Navigation assessment is passive, and page assessment reuses either a snapshot requested by the
agent or the same bounded job-card read already used for job collection. Browser Session
sends no detection request and does not refresh or open a page for this purpose. `browser_snapshot`
returns `platformAccessObservation`; when it is non-null, the same observation is already queued for
the periodic Workspace Service report. A platform page loaded before monitoring begins is also
reassessed by the passive collection cycle. The Dashboard still shows timestamped
observations, not a timeless live authentication guarantee.

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

Job-card snapshots separately bound the number of job cards to 100 and return the card's
title, company, salary, location, tags, bounded card text, and same-platform detail link when the
page exposes those fields. The default limit is 50. The snapshot covers only job cards already
loaded into the current document; `truncated` reports clipping at the requested card limit.
BOSS salary digits rendered through the page's private-use character set are deterministically
mapped to their displayed decimal digits before the bounded card evidence is returned; this does
not alter navigation or bypass an access decision.

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
