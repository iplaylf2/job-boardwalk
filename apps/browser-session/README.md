# Browser Session

Browser Session is Job Boardwalk's long-lived loopback HTTP MCP service for a visible persistent
browser. It drives a Chromium-based browser through Patchright, owns the dedicated profile and
browser process, coordinates tabs and page actions, and derives authentication observations from
top-level navigation responses and bounded snapshots when a platform adapter has a conclusive
rule. Page meaning not covered by an adapter remains with the agent.

Browser Session is a host companion by design. It runs in the same graphical session the user
can observe and take over; it is not part of the Compose deployment. Workspace Service and
Dashboard run in containers, while Workspace Service's loopback-published port preserves the
existing local HTTP relationship without giving either container access to the browser profile
or desktop.

The dedicated profile survives service restarts and is never shared with another application.
Browser Session tools never read or return cookies, browser storage, or profile contents. Their
bounded page evidence lets the agent reconcile automation results with the window the user can
see.

The tool surface supports the platforms listed under [Platform coverage](#platform-coverage)
through one recruiting-platform adapter contract. The catalog defines navigation destinations
and scope; platform modules recognize page content and authentication evidence. A platform's
HTTPS scope permits research navigation and explicit login-handoff preparation; login,
verification, and other account actions remain under user control.

## Platform coverage

Each platform document owns its page coverage, interpretation rules, and validation limits.
Shared browser behavior is defined in this README.

- [BOSS直聘](docs/platforms/boss.md)
- [鱼泡直聘](docs/platforms/yupao.md)
- [前程无忧51job](docs/platforms/51job.md)

## Job evidence reads and passive collection

### Job cards

`browser_job_card_snapshot` reads recognizable cards already loaded on an eligible collection
page. It returns each card's title, company, salary, location, tags, bounded text, and
same-platform detail link when available. It returns up to 50 cards by default, with a maximum
of 100. `truncated` reports clipping at the requested card limit; it does not describe coverage
beyond the current document. An empty collection does not establish that the platform has no
results. Personal-center engagement pages are outside this tool's collection scope.

Deduplication requires a reliable detail identity. Independent linkless cards remain separate
even when their visible facts are identical. This read does not navigate, scroll, click, open
details, or persist jobs. It may refresh conclusive platform-access evidence from the same
document. To open a card through a page control, use the references returned by
`browser_snapshot`, as described in [Tabs and page evidence](#tabs-and-page-evidence).

### Job descriptions and source binding

`browser_job_description_snapshot` reads the main posting description and recognizable job facts
from a supported detail page, excluding surrounding recommendations. It submits the observation
to Workspace Service with agent attribution and returns only after the service accepts and
retains it. A rejected write or a `stale` outcome fails the call. Its `truncated` flag describes
clipping at the local description-text limit.

When the agent has independently confirmed that the current page belongs to a tracked source
with no retained description, external job ID, or job URL, it may pass that workspace `sourceId`
for an explicit bind. Workspace Service validates the source before attaching the stable
detail-page identity. Source binding requires this explicit input.

### Passive collection and persistence

The passive collector observes eligible open supported-platform tabs when it starts and every 30
seconds afterward. Collection pages contribute recognizable cards; detail pages contribute their
main posting description. The collector submits observations with system attribution. It never
navigates, scrolls, clicks, or opens tabs, and excludes personal-center pages.

Workspace Service reconciles submitted observations into durable sources. A card without a
detail link is submitted without an external ID or job URL. Keeping those cards separate in a
snapshot does not establish separate durable identities for otherwise indistinguishable
observations. The agent can use the explicit source-binding workflow after confirming a tracked
source's identity.

Explicit and passive workflows can submit observations in a different order from their page
reads. Each submission carries its capture time, and Workspace Service preserves a captured
description when later card evidence arrives. A page that closes or navigates during its bounded
read is reported and skipped while evidence from other tabs is retained. The same DOM pass
refreshes any conclusive platform-access evidence.

Workspace Service owns the selected intent and its platform recommendation pages. The agent
compares that context with page evidence and explicitly navigates within the user's research
task. [Product design](../../docs/product-design.md#job-discovery-and-evidence) defines the
cross-application evidence lifecycle.

## Explicit job-engagement synchronization

`browser_sync_job_engagement` reads a supported platform-maintained category only within a
user-requested agent task. A scan is scoped to one platform and category. Each call opens or
reuses the platform tab, brings it to the foreground, reads one bounded batch from the category,
and immediately writes that evidence to Workspace Service with agent attribution. An observation
records the platform category in which a job appeared, independent of which actor performed the
represented action.

When a platform adapter provides a continuation, another call with the same platform and
category resumes the bounded in-memory scan. The scan accumulates at most 60 distinct jobs and
is discarded when it completes, reaches the bound, has no continuation, the current batch
contains no recognized jobs, or Browser Session restarts. `complete=true` requires the
accumulated evidence to match the platform-visible category total without exceeding the scan
bound. `complete=false` identifies partial evidence; it does not promise that the scan can
continue. Platform cards may omit job links. When a recognized link is present, Browser Session
preserves it and derives the stable external job ID; otherwise the snapshot retains the visible
job facts.

A complete `interested` snapshot may remove relations no longer present. The `contacted`,
`applied`, and `interviewed` relations preserve historical observations even when a later
platform list omits them. [Product design](../../docs/product-design.md#engagement-tracking)
defines the cross-application meaning of engagements and complete or partial snapshots.

### Supported categories and continuation

Supported categories and pagination come from the [platform
catalog](../../packages/platform-catalog/src/index.ts). The `browser_sync_job_engagement` MCP
description derives its capability summary from that same configuration. Unsupported categories
fail before browser navigation or workspace writes.

Check the capability summary and visible page before requesting another batch. Once a scan ends,
another call starts from the category entry page. Completeness covers the platform-visible
category and history window, not all-time activity. Platform-specific category meanings,
evidence limits, and validation coverage are documented under [Platform
coverage](#platform-coverage).

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

### Access assessment

Adapters classify only the authentication evidence their page definitions recognize. Their
specific rules are documented under [Platform coverage](#platform-coverage); unclassified evidence
returns `platformAccessObservation=null`.

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
content. Adapters return `platformAccessObservation=null` for unclassified evidence.

[Reliable browser research](../../docs/product-design.md#reliable-browser-research) owns the
re-observation and recovery policy. Repeated timeouts do not strengthen the available evidence:
Browser Session returns them without inferring a cause or initiating page recovery. When bounded
driver reads cannot inspect the visible page, the caller follows the linked policy and uses the
user's observation before deciding the next action.

### Tabs and page evidence

Tabs for supported platforms are discovered, selected, validated, and controlled through the
same adapter-driven workflow. `browser_tabs ensure` requires a catalog `platformId`, then reuses
a tab for that platform before creating one at its catalog entry URL. The service can list and
activate all in-scope tabs, but does not expose unconditional tab creation or a tab-close
action. The platform catalog owns each platform's label and web navigation metadata: its
canonical origin, navigation domain, and absolute entry and login URLs. Adapters derive
destinations and the HTTPS navigation boundary from that one contract. Page actions remain
platform-independent.

`browser_snapshot` returns rendered page text and references to visible interactive elements.
Names use explicit labels when present and otherwise rendered text, excluding hidden child
content. Snapshots omit form-control values and password controls. Names are limited to 300
characters; adapter-provided card context is limited to 1500. These field limits do not set
`truncated`. That flag reports clipping of page text or the element collection, or omission of
oversized links.

Adapters can expose additional detail-opening controls with `context` containing bounded text
from the owning card. Use that context to distinguish same-name postings and pass the control's
`ref` to `browser_click`. References belong to page control and are never persisted job
identities.

Before using a reference, Browser Session repeats the bounded snapshot and matches the original
DOM node, URL, captured attributes, and bounded element text and card context. Replaced nodes
fail validation even when their names are identical. This comparison covers the captured
signature; it does not detect every change elsewhere in the page or beyond the text limits.
Reference numbers are not reused within an executor. A new `browser_snapshot`, navigation, or
page action expires previous references.

An explicit link outside the current tab's platform scope is rejected before clicking. Clicking,
filling, and selecting otherwise operate on the captured element without classifying its
business purpose. The agent applies the user-handoff rules before login, verification,
application, message, or account actions.

The click path listens for popup events during the click and for up to one second after click
completion. An observed popup becomes the selected tab and supplies the returned page summary;
otherwise the summary describes the source tab. A popup arriving later requires an explicit tab
observation. This event window does not establish that job results have loaded.

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

The [platform catalog](../../packages/platform-catalog/src/index.ts) owns cross-application
navigation scope, entry and login URLs, engagement destinations, and pagination. A null
engagement destination declares an unsupported category.

Within Browser Session, [page definitions](src/browser/platforms/page-definitions.ts) register
one module per catalog `PlatformId`. Each module owns collection-page recognition,
authentication evidence, search-card and detail selectors, and job-link rules. The recruiting
adapter factory combines those definitions with catalog metadata. Job-link recognition and
extraction consume the same path rules when assigning stable external IDs.

[Engagement adapters](src/browser/job-engagement/platform-adapters.ts) own page capture and
category totals. Their shared factory derives targets, URL matching, and continuation from the
catalog. All engagement DOM captures implement the [capture
contract](src/browser/job-engagement/types.ts); callbacks remain self-contained because they
execute in the browser page realm. Shared job-link rules are passed as input rather than copied
into a callback.

Page definitions may expose collection-page interaction selectors with a role and an owning
context selector. These only apply on recognized collection pages; the shared snapshot and
action boundary owns visibility, references, validation, and popup handling.

To add a platform, update the catalog, register its page definition, and provide its engagement
capture and total handling. Add its document under `docs/platforms/` and link it from [Platform
coverage](#platform-coverage). Keep platform-specific interpretation and validation limits
there; common tool instructions describe shared behavior, and capability summaries derive from
the catalog. Validate accepted and rejected page boundaries, source identity, empty and partial
categories, and any continuation behavior. Page actions and collection orchestration consume the
shared interfaces. Access conclusions requiring general page interpretation remain the agent's
responsibility.

### Driver boundary

Browser Session uses Patchright rather than Playwright because live testing showed BOSS navigating
itself to `about:blank` when the Runtime protocol domain was enabled. Patchright provides the
required page API without enabling that domain. Browser Session also leaves console event
collection disabled; do not add Playwright or raw `Runtime.enable` or `Console.enable` calls
alongside it.

#### Demand-driven request interception

Patchright avoids `Runtime.enable` for initialization scripts by registering a Playwright route
that intercepts HTML responses. Patchright 1.62.3 also enables Chromium's Fetch interception for
every page at construction, before any route exists. Browser Session does not register request
routes or use `addInitScript`, `exposeFunction`, `exposeBinding`, tracing, or clock features. Eager
interception therefore puts every request through a pause-and-continue exchange without serving a
Browser Session requirement.

The workspace patch restores the constructor's existing demand-driven
`updateRequestInterception()` call. Registering a route still makes `needsRequestInterception()`
enable Fetch interception, so the patch narrows when interception starts; it does not remove
Patchright's initialization-script mechanism. In live A/B testing, eager interception allowed the
BOSS root and city document responses to return but left the city document uncommitted.
Demand-driven interception completed the same-tab root-to-city navigation. The fix is driver-wide,
not a BOSS URL exception.

The root `pnpm-workspace.yaml` applies the version-specific patch. Reassess it before Browser
Session adopts a request-routing, initialization-script, binding-exposure, tracing, or clock API.
Test both the new interceptor and visible BOSS root-to-city navigation before accepting such a
change. Remove the patch when Patchright no longer enables Fetch interception without an active
interceptor; after removal, perform a frozen install, build the Browser Session artifact, and
repeat the navigation check.

### Browser launch policy

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

### Runtime dependency packaging

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
