# Browser Session

Browser Session is Job Boardwalk's long-lived loopback HTTP MCP service for a visible persistent
browser. It drives a Chromium-based browser through Patchright, owns the dedicated profile and
browser process, coordinates tabs and page actions, and derives authentication observations from
top-level navigation responses and bounded snapshots when a platform adapter has a conclusive
rule. Page meaning not covered by an adapter remains with the agent.

Browser Session is a host companion by design. It runs in the same graphical session the user can
observe and take over; it is not part of the Compose deployment. Workspace Service and Dashboard
run in containers, while Workspace Service's loopback-published port preserves the existing local
HTTP relationship without giving either container access to the browser profile or desktop.

The dedicated profile survives service restarts and is never shared with another application.
Browser Session tools never read or return cookies, browser storage, or profile contents. Their
bounded page evidence lets the agent reconcile automation results with the window the user can see.

The current tool surface supports both BOSS直聘 and 鱼泡直聘 through one recruiting-platform adapter
contract. Each adapter owns its platform-specific navigation and authentication rules. A platform's
HTTPS navigation scope permits research navigation and explicit login-handoff preparation; login,
verification, and other account actions remain under user control.

## Job evidence reads and passive collection

`browser_job_card_snapshot` is the structured job-card read boundary. It accepts eligible pages
inside BOSS直聘 or 鱼泡直聘's supported HTTPS navigation scope and returns bounded, deduplicated
job-card evidence already present in that document without navigating, scrolling, clicking,
opening details, or persisting jobs. A page with no recognizable cards returns an empty card
collection; a personal-center engagement page is rejected instead. Workspace Service owns the
selected intent and its platform recommendation pages; the agent compares that context with live
page evidence and explicitly navigates when the user requests research.

`browser_job_description_snapshot` is the corresponding structured job-description boundary for a
supported detail page. It reads the main posting description and recognizable job facts such as
title, company, location, and salary, then submits that observation to Workspace Service. The tool
returns the captured observation only after Workspace Service accepts and retains it. A rejected
write or a `stale` outcome fails the call. Recommended job cards are excluded. Its `truncated` flag
means Browser Session reached its local text limit and characterizes capture completeness only.
Browser Session attributes this explicit write to the agent; passive writes use system attribution.
When the agent has independently confirmed that the current page belongs to a tracked source with
no retained description, external job ID, or job URL, it may pass that workspace `sourceId` for an
explicit bind. Workspace Service validates the source before attaching the stable detail-page
identity; source binding always requires this explicit input.

The passive collector observes eligible open supported-platform tabs when it starts and every 30
seconds afterward. Collection pages contribute recognizable cards; detail pages contribute their
main posting description. The collector never navigates, scrolls, clicks, or opens tabs.
Personal-center pages are excluded. Explicit and passive workflows can submit observations in a
different order from their page reads. Each submission carries its capture time, and Workspace
Service reconciliation preserves a captured description when later card evidence arrives. A page
that closes or navigates during its bounded read is reported and skipped while evidence from other
tabs is retained. The same bounded DOM pass refreshes any conclusive platform-access evidence.
Recommendation-page and detail-page navigation remain explicit agent actions within user-delegated
research.

[Product design](../../docs/product-design.md#job-discovery-and-evidence) defines the
cross-application evidence lifecycle.

## Explicit job-engagement synchronization

`browser_sync_job_engagement` synchronizes interested, contacted, applied, and interviewed jobs
only within a user-requested agent task. A scan is scoped to one platform and category. Each call
opens or reuses the platform tab, brings it to the foreground, reads one bounded batch from the
category, and immediately writes that evidence to Workspace Service with agent attribution. Browser
Session invokes this workflow only through explicit agent calls. An observation records the
platform category in which a job appeared, independent of which actor performed the represented
action.

When a platform adapter provides a continuation, another call with the same platform and category
resumes the bounded in-memory scan. The scan accumulates at most 60 distinct jobs and is discarded
when it completes, reaches the bound, has no continuation, the current batch contains no recognized
jobs, or Browser Session restarts. `complete=false` identifies partial evidence; `complete=true`
identifies a complete platform category within the scan bound. Platform cards may omit job links.
When a recognized link is present, Browser Session preserves it and derives the stable external job
ID; otherwise the snapshot retains the visible job facts.

A complete `interested` snapshot may remove relations no longer present. The `contacted`, `applied`,
and `interviewed` relations preserve historical observations even when a later platform list omits
them. [Product design](../../docs/product-design.md#engagement-tracking) defines the
cross-application meaning of engagements and complete or partial snapshots.

## Run Browser Session from source

Browser Session requires a graphical desktop session and Patchright's Chromium binary. It does not
require a particular operating system, shell, VM, or editor, but it must not run in the headless
service containers because the visible host window is the user-handoff boundary.

Install the browser once:

```sh
pnpm --filter @job-boardwalk/browser-session exec patchright install chromium
```

Then run the service:

```sh
pnpm exec moon run browser-session:dev
```

For a built run:

```sh
pnpm exec moon run browser-session:build
pnpm exec moon run browser-session:start
```

The build has two application-owned stages. Vite compiles application and workspace code to
`dist/index.cjs` and leaves third-party packages as ordinary Node.js runtime dependencies. Then
`pnpm deploy --prod` creates the portable package at
`target/service-artifacts/browser-session/`, containing the application manifest,
`dist/index.cjs`, and the locked production `node_modules`. Patchright therefore retains its
published modules and runtime resources. `dist/index.cjs` is the package's public runtime
entrypoint.

The finalized entry module exports `serviceCompletion` as its application-owned lifecycle promise.
It accepts explicit process arguments for a `chrome` or `msedge` browser channel or a browser
executable, plus the profile directory, listener hostname and port, and Workspace Service URL.
Source development uses the documented environment overrides and loopback defaults. Selecting an
executable supplies a launch candidate, not a compatibility guarantee. Browser discovery, product
layout, process hosting, and supervision remain outside Browser Session.

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

Job-observation submission uses the same Workspace Service URL. A rejected explicit description
write or a `stale` outcome fails the tool call. A failed passive write is reported locally and stops
the current collection pass without stopping browser control; a later pass may submit fresh
evidence if the page remains eligible.

### Platform adapter coverage

Both adapters use the same tab, navigation, snapshot, and login-handoff workflow. Their current
automatic access-assessment coverage differs:

| Platform | Automatic access assessment                                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BOSS直聘 | Successful protected navigation records `authenticated`; redirect from protected navigation to login records `unauthenticated`; a bounded snapshot containing the complete set of account-only navigation links records `authenticated`. |
| 鱼泡直聘 | A bounded snapshot containing a complete job-seeker or recruiter account header records `authenticated`.                                                                                                                                 |

Navigation assessment is passive, and page assessment reuses either a snapshot requested by the
agent or a bounded page read already performed by passive job collection or an explicit engagement
sync. Assessment stays within those existing reads.

`browser_snapshot` returns `platformAccessObservation`; when it is non-null, the same observation is
already queued for the periodic Workspace Service report. A platform page loaded before monitoring
begins is also reassessed by its owning collection cycle. The Dashboard presents each observation
with its observation time.

## Runtime behavior

### Browser lifecycle

One top-level shajara scope owns the HTTP server, visible browser process, persistent context,
Workspace Service status reporter, recovery loops, and shutdown. If the browser window is closed
unexpectedly, Browser Session reports the interruption and launches it again with bounded
exponential backoff. A failed page action remains contained to its request; Browser Session does not
replay it.

MCP actions, tab coordination, and snapshots run as `RiteCoroutine` routines. Patchright and Node
Promises are adapted with `until(...)` at the leaf SDK call; application-owned waits use shajara
primitives. Promise-returning adapters remain only at the HTTP, process-entry, and external-resource
boundaries.

Stopping Browser Session closes the browser it owns. The persistent profile retains ordinary client
state for the next service run.

### Page inspection and failure classification

Browser availability and page inspection are separate signals. `browser_status.available=false`
means the managed browser runtime is unavailable. A live runtime can still contain one problematic
tab: `browser_tabs` probes each supported page with a bounded DOM evaluation and reports
`pageInspection.outcome` as `observed`, `timed-out`, or `page-closed`. An observed document also
reports its `documentReadyState` as `loading`, `interactive`, or `complete`. `timed-out` means only
that the bounded DOM inspection did not finish; cause analysis requires separate evidence.
`complete` describes the document load lifecycle. Lazy and application-triggered resources require
their own observation when they matter to the workflow.

Navigation waits 30 seconds for `DOMContentLoaded`. A timeout returns
`navigation.outcome=timed-out`, `waitUntil=domcontentloaded`, and the independently collected page
inspection as a structured result. Navigation and inspection remain independent outcomes. Snapshot
DOM evaluation waits up to five seconds. A read timeout reports a closed tab, a page-inspection
timeout, or the observed document lifecycle state. Other errors retain their original failure.

[Access observations](../../docs/product-design.md#access-observations) defines what these signals
can establish. Verification and access-denial conclusions require visible controls or semantic page
content. Current adapters classify the authentication cases listed above and return
`platformAccessObservation=null` for unclassified evidence.

[Reliable browser research](../../docs/product-design.md#reliable-browser-research) owns the
re-observation and recovery policy. Repeated timeouts do not strengthen the available evidence:
Browser Session returns them without inferring a cause or initiating page recovery. When bounded
driver reads cannot inspect the visible page, the caller follows the linked policy and uses the
user's observation before deciding the next action.

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

### Browser handoff

[Product design](../../docs/product-design.md#browser-handoff) owns the delegation boundary: login,
verification, applications, messages, and account changes remain under user control. Browser
Session implements the browser side of that handoff.

`browser_prepare_login` first blocks new background page work and waits for in-flight page work to
finish. It then observes the existing platform tabs. Authenticated-page evidence returns
`outcome=already-authenticated` without navigation or user handoff. Otherwise the tool retains every
readable platform tab that is still on the catalog-defined login route as a candidate, checks all
of them for a usable login interface, and activates the first one that becomes ready. It preserves
unreadable tabs and readable pages whose meaning remains unclassified, including pages that may be
showing verification or another access decision. When no reusable login page remains, it uses an
available blank tab or a new tab and performs bounded observations on the login destination. It
returns `outcome=handoff-ready` only when that page exposes an enabled user control. This outcome
starts user handoff. If neither outcome can be established, preparation fails and passive
collection resumes. Workspace Service writes already started from previously captured evidence may
finish during a handoff because they do not drive the browser.

After the user explicitly returns control, the agent calls `browser_snapshot` with
`userReturnedControl=true` for its first live-page observation; earlier and ordinary snapshots omit
the flag. The flag resumes passive page reads and authorizes a later explicit job-engagement
sync to reuse the observed platform tab. It records returned control; subsequent page evidence
determines authentication status.

## Maintenance constraints

The adapter registry is exhaustive over the catalog's `PlatformId` type. Adding a recruiting
platform therefore requires catalog metadata and a Browser Session adapter. Conclusive
platform-specific access rules belong in that adapter; interpretation that needs general page
meaning remains outside Browser Session.

The platform job-link boundary owns each supported job-detail path and its stable external ID
capture. Job-card recognition, passive submission, and engagement synchronization consume that same
path contract, so a display slug or another incidental trailing segment cannot become source
identity.
Cross-application navigation origins and destinations remain in the platform catalog; page-specific
job-link shapes remain inside Browser Session.

### Driver and launch boundary

Patchright replaces Playwright at the driver boundary because enabling the Runtime protocol domain
made BOSS navigate itself to `about:blank` during live testing. Patchright keeps the familiar page
API without enabling that domain. Browser Session also leaves console event collection disabled; do
not add Playwright or raw `Runtime.enable`/`Console.enable` calls alongside it.

Browser Session explicitly enables Chromium's process sandbox for every launch. Patchright
otherwise passes `--no-sandbox` by default; do not restore that default to work around host setup or
to silence a browser warning. A browser that cannot launch with its process sandbox is incompatible
with Browser Session and must fail at the launch boundary. The same launch policy applies to
Patchright's installed Chromium, a named browser channel, and an explicit browser executable.

Patchright owns its other default command-line switches, including
`--disable-blink-features=AutomationControlled`, which Patchright uses to avoid detection through
`navigator.webdriver`. Edge may warn that this exact switch is unsupported. This is an expected
browser response to the Patchright launch policy, not by itself a launch failure. Do not hide it
with another switch or host policy, and do not filter a Patchright default in isolation. A warning
that identifies another switch still requires investigation. A change to driver defaults requires
representative compatibility evidence for Patchright's installed Chromium and for Chrome, Edge,
and Chromium launched through the supported channel and executable-path inputs.

Patchright remains an external runtime dependency so its generated modules and package-relative
resources stay together. A Patchright upgrade must preserve that package boundary and pass the
Browser Session artifact build.

## Development

Tests cover the public tool contract, URL and origin boundaries, bounded inputs, browser-context
behavior, and lifecycle ownership. Driver internals and reader-facing prose are not test contracts.

```sh
pnpm exec moon run \
  browser-session:lint \
  browser-session:typecheck \
  browser-session:test \
  browser-session:build
```
