# Browser Session

Browser Session is Job Boardwalk's long-lived loopback HTTP MCP service for a visible persistent
browser. It drives a Chromium-based browser through Patchright, owns the dedicated profile and
browser process, coordinates tabs and page actions, and derives platform-access observations from
top-level navigation responses and bounded snapshots when a platform adapter has a conclusive
rule. Page meaning not covered by an adapter remains with the agent.

Browser Session is a host companion by design. It runs in the graphical session the user can
observe and take over. In the Compose deployment, Workspace Service and Dashboard run in containers
while Browser Session runs on the host. Workspace Service's loopback-published port lets Browser
Session submit evidence without giving either container access to the browser profile or desktop.

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

## Run Browser Session from source

Browser Session requires a graphical desktop session and Patchright's Chromium binary. It does not
require a particular operating system, shell, VM, or editor, but it must not run in the headless
service containers because the visible host window is the user-handoff boundary.

From the repository root, install the locked dependencies and Patchright's browser:

```sh
pnpm install --frozen-lockfile
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
executable, plus the graphics backend, profile directory, listener hostname and port, and
Workspace Service URL.
Source development uses the documented environment overrides and loopback defaults. Selecting an
executable supplies a launch candidate, not a compatibility guarantee. Browser discovery, product
layout, process hosting, and supervision remain outside Browser Session.

By default, the dedicated browser profile is stored under the operating system's user data
directory. Set `JOB_BOARDWALK_BROWSER_PROFILE_PATH` to choose an exact path. Browser Session does
not share this path or profile with another service. Project entrypoints do not load `.env`
themselves.

### Graphics backend

All supported platforms share one browser environment. Graphics configuration belongs to the
Browser Session process and applies to every platform and tab throughout the session.
`--browser-graphics-backend=default|swiftshader` selects that backend at browser startup.
Omitting the argument uses Chromium's default. For environments that need a software OpenGL ES
driver, select `swiftshader` explicitly:

```sh
pnpm --filter @job-boardwalk/browser-session exec tsx src/main.ts --browser-graphics-backend=swiftshader
```

Packaged launchers can pass the same process argument. Use [page diagnostics](#page-diagnostics)
to check WebGL context availability and the reported renderer. These checks do not test rendered
output or establish why a platform requested verification.

Software rendering consumes CPU and has security and performance tradeoffs. Chromium does not
recommend SwiftShader for untrusted content; see its
[SwiftShader documentation](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md).
Choose this backend for the deployment environment and validate it across supported platforms.
The flag mapping and sandbox requirements belong to
[Browser launch policy](#browser-launch-policy).

## Endpoints and reporting

The Streamable HTTP MCP endpoint is <http://127.0.0.1:54312/mcp>; health is available at
<http://127.0.0.1:54312/health>. The service binds to loopback and rejects non-local browser origins,
but this is not authentication: local processes are inside the service trust boundary.

MCP tools return `{ result: ... }` on success. Execution failures set `isError=true` and
return [`OperationErrorResponse`](../../packages/contracts/src/operation-error.ts) with
`error.code`, `error.details`, and a display `error.message`. Both outcomes appear in
`structuredContent` and JSON text. Unknown tool names use the MCP protocol error `-32602`
with `data.tool`.

### Health and runtime diagnostics

Browser runtime status is exposed directly through `browser_status` and `/health`. Desktop Manager
uses the health endpoint for its product-level availability display. Dashboard may read the same
endpoint as an optional client. Workspace Service receives no browser runtime reports.

Health responses are uncached. Local HTTP(S) page origins may read `GET /health` through CORS,
without credentials; this permission does not extend to MCP or browser actions.
[Dashboard configuration](../dashboard/README.md#service-origin-configuration) supplies the service
origin and the client-side connection policy.

An unavailable runtime reports `lifecycle.phase` (`starting`, `closing`, `retry-wait`, or
`stopped`) and the phase's `phaseStartedAt` timestamp. `retry-wait` includes `nextAttemptAt`, the
scheduled attempt time. `lastFailure`, when present, records a category (`launch-failed`,
`window-closed`, or `runtime-failed`) and `occurredAt`. These fields describe browser lifecycle;
platform-access assessments come from the page evidence described below. Lifecycle transitions and
detailed local errors carry UTC timestamps. A long-running phase can identify where investigation
should begin without asserting its cause.

An available runtime reports `available=true`, `tabCount`, an optional `browserVersion`, and
`control`. The control state describes which actor may use the session:

| `control.state`     | Meaning                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `active`            | Agent operations may proceed within the delegated scope.         |
| `quiescing`         | Login preparation is waiting for in-flight collection to finish. |
| `preparing-handoff` | Browser Session is preparing the login interface.                |
| `user-handoff`      | The session is paused for user control.                          |

`control.interruption` retains the latest access observation that triggered a pause, including its
platform, URL, observation time, and evidence category. It is null when no such observation is
retained, including a login handoff without an access interruption. `control.matchingTabIds` lists
open tabs currently at that URL, using tab metadata without reading their documents. Several tabs
can match, and the list can become empty after navigation or closure; it does not identify the
original triggering tab.

Both status endpoints remain readable during handoff. The [handoff protocol](#browser-handoff)
defines how control returns and when the retained interruption is cleared.

The process writes operational output to standard streams. Shutdown requests record the signal and
UTC time; fatal service errors include nested failures and available stacks, including errors wrapped
during resource cleanup. The launcher owns log retention and process exit status. See
[exit diagnosis](../../docs/deployment.md#browser-session-exit-diagnosis) for host-side checks when
HTTP health is unavailable.

### Page diagnostics

`browser_page_diagnostics` reports the environment visible to a supported-platform page through
the existing Patchright instance. Use `tabId` to choose the page; omission uses the selected
supported-platform tab, or the first available supported-platform tab if the selection is unavailable.
The tool is unavailable during user handoff.

The result's `environment` includes language, timezone, screen and viewport dimensions,
`webdriver`, and WebGL information. `environment.webgl=null` means the diagnostic could not create
a WebGL context. When a context exists, its renderer and vendor can still be null if the debug
renderer extension is unavailable. `environment.scriptUrls` lists external script origins and
paths, with query strings and fragments omitted. These observations help diagnose the shared browser environment;
they do not establish a platform's reason for requesting verification.

With `screenshot=true`, `screenshot.data` contains a base64 viewport PNG and `screenshot.mimeType`
is `image/png`. Input, textarea, and editable regions are masked; other visible page content
remains in the image.

### Access assessment

Adapters classify authentication and access interruptions using the rules documented under
[Platform coverage](#platform-coverage). Unclassified evidence returns
`platformAccessObservation=null`.

Navigation assessment is passive, and page assessment reuses either a snapshot requested by the
agent or a bounded page read already performed by passive job collection or an explicit engagement
sync. Assessment stays within those existing reads.

`browser_snapshot` returns `platformAccessObservation`; when it is non-null, the same observation is
already eligible for submission to Workspace Service. Pages open before monitoring begins are
also assessed by passive collection when eligible.

### Access interruption diagnostics

When access assessment identifies an interruption, Browser Session writes a
`browser-access-interruption` JSON event to standard error. The event includes the interruption
and recent document, fetch, and XHR response metadata for the affected platform. HTTP 200 HTML
responses are included because an asynchronous verification challenge can use that response
shape; status and MIME type alone do not classify it as a challenge.

The passive diagnostic buffer holds at most 128 responses across supported platforms. Each event
selects responses from the affected platform observed within the last two minutes. Response
metadata includes timestamps, URL origins and paths, resource types, status codes, MIME types,
and the presence of a `Punish-Type` header. URL credentials, query strings, fragments, other
header values, and response bodies are omitted. URL paths can still contain identifiers.

These local diagnostics are separate from evidence submitted to Workspace Service. The launcher
owns log retention, and response capture begins when browser monitoring starts.

### Evidence submission

Browser Session checks for new platform-access observations every five seconds and submits each to
Workspace Service's
[`PUT /api/platform-access/observations`](../workspace-service/README.md#platform-access-observations).
Pending observations are coalesced by platform and page URL. A successful submission removes the
submitted capture; a newer capture of the same page remains pending. Failed submissions remain
eligible for a later attempt. Set `JOB_BOARDWALK_WORKSPACE_SERVICE_URL` when Workspace Service is
not available at <http://127.0.0.1:54310>.

Job-observation submission uses the same Workspace Service URL. A rejected explicit description
write or a `stale` outcome fails the tool call. Structured Workspace Service rejections retain
their code and details, with `httpStatus` added. A failed passive write is reported locally and stops
the current collection pass without stopping browser control; a later pass may submit fresh
evidence if the page remains eligible.

## Runtime behavior

### Browser lifecycle

One top-level shajara scope coordinates the service's HTTP handling, browser lifecycle routines,
observation reporting, and shutdown. Browser Session manages the browser process through
Patchright. If the browser window closes unexpectedly, the service reports the interruption and
launches it again with bounded exponential backoff. A failed page action remains contained to
its request; Browser Session does not replay it.

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

Navigation waits up to 30 seconds for `DOMContentLoaded`. A timeout returns
`navigation.outcome=timed-out` and `navigation.waitUntil=domcontentloaded`, together with an
independent `pageInspection`. If the final URL leaves supported platform scope, the result still
includes that URL and the navigation outcome; `platformId=null` and `pageInspection=null` indicate
that the destination document was not inspected. Further page controls require a supported target.

Navigation and click results also include `control` as observed when the operation returns. A later
access observation can pause the session before the next request; callers must check each result.

Snapshot DOM evaluation waits up to five seconds. On timeout, `error.details.pageInspection`
reports a closed tab, an inspection timeout, or the observed document lifecycle state.

[Access observations](../../docs/product-design.md#access-observations) defines what these signals
can establish. Verification and access-denial conclusions require visible controls or semantic page
content. Adapters return `platformAccessObservation=null` for unclassified evidence.

[Reliable browser research](../../docs/product-design.md#reliable-browser-research) owns the
re-observation and recovery policy. Repeated timeouts do not strengthen the available evidence:
Browser Session returns them without inferring a cause or initiating page recovery. When bounded
driver reads cannot inspect the visible page, the caller follows the linked policy and uses the
user's observation before deciding the next action.

### Tabs and page evidence

`browser_tabs` manages tabs within supported platforms' HTTPS scopes:

- `list` returns supported tabs and their bounded `pageInspection` results.
- `activate` selects a supported tab and brings it to the foreground.
- `ensure` requires a `platformId` and reuses a tab for that platform when possible. An explicit
  `url` selects the destination; otherwise a newly prepared tab uses the platform's entry URL.
- `close` requires an explicit `tabId` and returns the remaining supported tabs with their `active`
  selection. Closing the selected tab selects a remaining supported tab when available. Closing
  the last supported tab returns an empty list.

The platform catalog owns labels, navigation domains, and entry and login URLs. Adapters derive
navigation scope from that contract. Tab operations follow the shared [handoff state](#browser-handoff);
the service does not expose unconditional tab creation.

#### Snapshots and references

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

References expire across the whole session: a new `browser_snapshot`, `browser_navigate`, or
page-control action in one tab expires references from the previous snapshot, even if it belongs
to another tab. Tab activation, ensuring, closing, login preparation, and engagement synchronization
also expire references. Reference numbers are not reused within an executor. When a reference
expires, take a new snapshot of its owning `tabId` before acting. For the most recently expired
snapshot, `error.details` includes `ref`, `tabId`, `invalidatedBy`, and any known
`invalidatedByTabId`. Older or unknown references identify only the requested `ref`.

Before acting on a valid reference, Browser Session repeats the bounded snapshot and matches the
original DOM node, URL, captured attributes, and bounded element text and card context. Replaced
nodes fail validation even when their names are identical. This comparison covers the captured
signature; it does not detect every change elsewhere in the page or beyond the text limits.

#### Reading with scroll and reveal

`browser_reveal` brings an observed `ref` into view and returns before/after evidence for the
element, its scrollable ancestors, and the window. Ancestors are identified by depth and tag name
in each observation, not as durable identities.

`browser_scroll` moves one measured viewport vertically: `direction=down` reads below and `up`
returns above. With a `ref`, it selects the element's nearest scrollable ancestor; otherwise it
scrolls the selected tab's document. An explicit `tabId` must agree with the reference's owning tab.
Body overflow propagated to the viewport is treated as document scrolling. An independent body
scroll container remains a container; reveal evidence uses the same distinction.

For document scrolling, the distance is the window height. For a container, it is the visible
intersection with the window, capped at the container's client height. This measurement does not
account for occlusion by other elements. An inner container at its boundary stays the target; the
action does not continue by scrolling its parent. If the region is outside the window, use
`browser_reveal` to bring the observed element into view before taking a fresh snapshot and scrolling.

The result reports the target type and `targetTagName`, measured viewport height, and before/after
target offsets (`scrollTop`) and window positions (`scrollY`). Movement in either measurement yields
`outcome=moved`; otherwise the outcome is `unchanged`. Reobserve the cards to assess research
progress: neither outcome establishes result exhaustion or newly loaded jobs.

#### Clicking and editing controls

An explicit link outside the current tab's platform scope is rejected before clicking. Empty
`javascript:` links, `javascript:;`, and `javascript:void(0)` (with optional whitespace and trailing
semicolon) are treated as page controls without a navigation destination; other script URLs are
rejected. These forms do not establish a control's business purpose or authorize account actions.
Clicking, filling, and selecting otherwise operate on the captured element without classifying its
business purpose. The agent applies the user-handoff rules before login, verification,
application, message, or account actions.

The click path listens for popup events during the click and for up to one second after click
completion. An observed popup becomes the selected tab and supplies the returned page summary;
otherwise the summary describes the source tab. A popup arriving later requires an explicit tab
observation. This event window does not establish that job results have loaded.

### Browser handoff

[Product design](../../docs/product-design.md#browser-handoff) defines which actions require user
control. Browser Session implements login preparation and the session-wide pause described here.

#### Preparing login

`browser_prepare_login` blocks new tool requests and background collections, waits for in-flight
collection work to finish, then observes existing platform tabs. It returns one of two outcomes:

- `already-authenticated`: a page provides authentication evidence. The tool selects that page
  without navigating and resumes background collection.
- `handoff-ready`: a login page exposes an enabled user control or a recognized login-mode link.
  The tool selects that page and leaves the session paused for the user.

Preparation reuses readable tabs on the catalog-defined login route. Unreadable tabs and pages
whose meaning remains unclassified are preserved. If no reusable login page remains, it uses an
available blank tab or a new tab to open the login destination. Candidate checks are bounded;
a `login-not-ready` error includes available candidate diagnostics in `error.details.candidates`.
A preparation failure resumes collection unless an adapter has recognized an access interruption.

#### While control is paused

A recognized verification request or access denial pauses the session even when discovered during
login preparation or a detail read that cannot extract a job description. The observation remains
eligible for submission to Workspace Service.

New browser tool calls fail with `user-control-active`, including tab listing and ordinary
snapshots. The error includes the retained access observation in
`error.details.platformAccessObservation` when known. Background collections do not start, and a
passive collection already in progress stops before the next tab. Already-started work is not
canceled by this gate; writes from captured evidence may finish.

To inspect control state and current URL-matching tabs during the pause, use
`browser_status` or `/health` as described under [Health and runtime diagnostics](#health-and-runtime-diagnostics).

The agent must still interpret unclassified pages and stop research for user-controlled actions
that the service cannot identify.

#### Returning control

After the user explicitly returns control, call `browser_snapshot` with
`userReturnedControl=true` for the first observation of the relevant `tabId`. This snapshot is
allowed during the handoff pause; ordinary snapshots omit the flag. After a successful read, it
releases the pause, clears the retained interruption, and lets a later engagement sync reuse the
observed platform tab. If the new snapshot identifies another interruption, the session pauses again
and retains that observation.

The snapshot returns `controlState` alongside `platformAccessObservation`: `active` permits
research, while `user-handoff` means the session is paused. Returned control does not establish
authentication; the page evidence supplies that assessment.

## Job evidence reads and passive collection

### Job cards

`browser_job_card_snapshot` reads recognizable cards already loaded on an eligible collection
page. Personal-center engagement pages are outside its scope. Each card includes its title,
company, salary, location, tags, bounded text, and same-platform detail link when available.
Deduplication requires a reliable detail identity; independent linkless cards remain separate
even when their visible facts are identical.

Choose `waitFor=none` to read the current document immediately, or `waitFor=cards-present` to
observe until recognizable cards are read or the service's response budget expires. The result
describes the observation:

- `outcome=cards-observed` means cards were read; the page may still be loading.
- `outcome=no-cards-observed` preserves the last successful empty read and its capture time.
  Loading, empty results, and an unrecognized layout remain indistinguishable.
- `truncated` reports clipping of the loaded card set at the service's response limit.
  It does not describe search coverage beyond the current document.

A read failure or an observed URL change ends the operation. If no read completes within the
budget, the tool fails without claiming an empty result.

This read may refresh conclusive platform-access evidence from the same document. It does not
navigate, scroll, click, open details, or persist jobs; [passive collection](#passive-collection-and-persistence)
handles separate background observations and writes. To open a card through a page control, use
the references returned by `browser_snapshot`, as described in
[Tabs and page evidence](#tabs-and-page-evidence).

### Job descriptions and source binding

`browser_job_description_snapshot` reads the main posting description and recognizable job facts
from a supported detail page, excluding surrounding recommendations. It submits the observation
to Workspace Service with agent attribution and returns only after the service accepts and retains
it. A rejected write or a `stale` outcome fails the call.

`description.capturedAt` records the capture time. `description.truncated` reports clipping at the
local description-text limit; it does not measure whether the extractor covered every part of the
posting. An `evidence-unavailable` error identifies `missingFields`, `pageTextAvailable`, and the
URL in `error.details`. Readable page text alone cannot distinguish absent content from an
unsupported section layout.

Each successful read also includes a `recruitment` assessment with its observation time and source
URL. Conclusive assessments include the page evidence; unmatched evidence returns `unknown`.
[Platform coverage](#platform-coverage) owns the recognition rules. Workspace Service owns
[retention and read semantics](../workspace-service/README.md#recruitment-observations).

Account engagement requires separate [platform evidence](../../docs/product-design.md#engagement-tracking);
a generic apply control alone does not establish whether the current account has applied.

To bind a previously tracked source without a detail identity, first confirm that the current
page belongs to that source. Pass its workspace `sourceId` only when the source has no retained
description, external job ID, or job URL. Workspace Service validates the source before attaching
the detail-page identity; its [source-binding rules](../workspace-service/README.md#source-binding)
define the required matches.

`persistence.outcome` reports the accepted [workspace write outcome](../workspace-service/README.md#observation-writes).
`sourceBinding` separately describes association with a caller-specified source:

- `sourceBinding.outcome=bound` includes the explicitly bound `sourceId`.
- `sourceBinding.outcome=not-requested` means no `sourceId` was supplied; the call does not
  establish an association with a previously tracked linkless card.

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

A scan accumulates at most 60 distinct jobs in memory. `complete=true` requires the accumulated
evidence to match the platform-visible category total without exceeding that bound;
`complete=false` describes partial evidence. Continuation is reported separately:

- `scan.state=continuable`: the next call with the same platform and category resumes the scan.
- `scan.state=ended`: the next call starts at the category entry. `scan.reason` is `complete`,
  `scan-limit`, `no-cards`, or `no-continuation`.

Service restart discards in-memory scans. Platform cards may omit job links. When a recognized
link is present, Browser Session preserves it and derives the stable external job ID; otherwise
the snapshot retains the visible job facts.

A complete `interested` snapshot may remove relations no longer present. The `contacted`,
`applied`, and `interviewed` relations preserve historical observations even when a later
platform list omits them. [Product design](../../docs/product-design.md#engagement-tracking)
defines the cross-application meaning of engagements and complete or partial snapshots.

### Supported categories and continuation

Supported categories and pagination come from the [platform
catalog](../../packages/platform-catalog/src/index.ts). The `browser_sync_job_engagement` MCP
description derives its capability summary from that same configuration. Unsupported categories
fail before browser navigation or workspace writes.

Completeness covers the platform-visible category and history window, not all-time activity.
Platform-specific category meanings, evidence limits, and validation coverage are documented under
[Platform coverage](#platform-coverage).

## Maintenance constraints

Tool inputs describe targets and observable intentions. Resource bounds for text, card count,
observation duration, and polling frequency belong to the service implementation. They bound work
and response size rather than define platform readiness. Observation conditions belong to the
read that can establish them. Add platform-level operations such as search submission or next
result page only when the adapter can identify the real control and report evidence for the
requested outcome.

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

The same execution boundary applies to card, description, snapshot, and scroll captures. Keep DOM
helpers inside the serialized callback and pass configuration as input; imported Node-side helpers
are unavailable in the page. Local object methods avoid the Node-side naming helpers that the source
runner can inject into nested function declarations. When the complete callback exceeds the function
length limit, explain serialization in a local disable; its nested helpers still receive size and
complexity checks.

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
that intercepts HTML responses. Patchright 1.63.0 also enables Chromium's Fetch interception for
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

The [graphics backend option](#graphics-backend) is applied at the shared launch boundary.
Platform adapters use this common environment; backend selection is independent of platform and URL.
`default` leaves Chromium's graphics flags unchanged. `swiftshader` passes
`--use-gl=angle --use-angle=swiftshader` to select ANGLE's software OpenGL ES driver. It preserves
the process sandbox and leaves the software renderer visible to pages. This driver mode does not
enable the separate `--enable-unsafe-swiftshader` WebGL fallback flag.

Browser Session inherits the launching process's environment, including locale, timezone, display,
and proxy configuration.

Browser Session explicitly enables Chromium's process sandbox for every launch. Patchright
otherwise passes `--no-sandbox` by default; do not restore that default to work around host setup or
to silence a browser warning. A browser that cannot launch with its process sandbox is incompatible
with Browser Session and must fail at the launch boundary. The same launch policy applies to
Patchright's installed Chromium, a named browser channel, and an explicit browser executable.

Patchright owns its other default command-line switches, including
`--disable-blink-features=AutomationControlled`, which Patchright uses to avoid detection through
`navigator.webdriver`. Edge may warn that this exact switch is unsupported. This is an expected
browser response to the Patchright launch policy, not by itself a launch failure. Do not hide it
with another switch or host policy merely to suppress the warning. Assess changes to driver defaults
against the behavior they affect, and validate representative affected browser and launch paths.
Expand that coverage when a change alters behavior shared across browser families; record the
tested versions and paths so the evidence does not imply untested compatibility.

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
