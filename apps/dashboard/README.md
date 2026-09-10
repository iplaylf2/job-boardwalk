# Dashboard

Dashboard is Job Boardwalk's local reading and maintenance surface for durable workspace data. It
organizes the current research basis, normalized job library, and research reports, while showing
timestamped platform-access evidence. It remains useful without an active agent conversation and
can independently check an optional Browser Session's health.

## Reader path

The interface has three primary reader paths:

- `/` presents the selected job-search intent and personal context. Personal facts are read-only by
  default and can all be expanded in place; a separate management surface owns creating, revising,
  selecting, and removing intents and facts. Platform-access evidence remains a compact
  secondary rail unless it needs attention.
- `/jobs` is the single normalized job library. Its in-page engagement navigation filters that
  library by the union of all tracked jobs or by `interested`, `contacted`, `applied`, or
  `interviewed`; these are views of one collection, not peer pages. The library also provides
  search, platform and description-availability filters, original source links, and server-backed
  pagination. Its heading reports how many jobs have a retained main description, how many do not,
  and how many of those lack both a platform job ID and detail-page link. The description filter can
  show jobs with a description, all jobs without one, or only that unresolved subset. Cards focus
  on comparable job facts and available actions. Their source rows show every observed engagement
  and link to the platform when a detail-page URL is available; the card footer reports when its
  latest engagement record was observed. A card offers the description dialog only when a collected
  description is available. The dialog reports when Browser Session reached its local text limit
  and the displayed description may be incomplete.
- `/reports` lists unexpired research reports, while `/reports/:id` renders one Markdown report.

The header owns only cross-resource navigation. Engagement filters belong to the job library and do
not appear as primary destinations.

## Data ownership and freshness

Workspace Service owns durable personal context, job-search intents, job facts and source
relations, platform-access observations, and reports. Dashboard reads those models from Workspace
Service through its HTTP API. Browser Session provides the separate optional health read described
below; each service owns its own resources and lifecycle.

When Workspace Service data cannot be loaded, Dashboard keeps the page header and primary
navigation visible. The affected data region reports the failure instead of presenting it as an
empty result; retryable failures offer a retry action.

Saved platform observations are historical evidence rather than a guarantee of current access.
Dashboard therefore presents definite authentication in the past tense and shows when the displayed
authentication or interruption assessment was most recently observed. Dashboard gives visual
priority to an unresolved platform interruption without opening or checking a recruiting page.

Dashboard rereads the workspace overview every five seconds and refreshes it after a user change.
The job-library page requests at most 24 jobs at a time and refreshes the selected view every 30
seconds. Research-report pages refresh every five seconds. These reads use Workspace Service's
local API and do not refresh recruiting pages.

## Optional Browser Session health checks

The overview has an independent browser-service status panel. Dashboard checks the configured
Browser Session's `/health` directly. Each `BrowserSessionCheckResult` describes one check: its
`outcome` is `unconfigured`, `configuration-error`, `failed`, or `observed`. An observed health
response separately reports whether the managed browser is ready. A failed read establishes neither
that the service is stopped nor why the check failed. Each check has a three-second deadline and runs
every five seconds while the overview is mounted; leaving the page cancels pending requests.
Workspace content and this health check have separate loading and failure boundaries.

### Service origin configuration

Dashboard's web server exposes `GET /browser-session/origin` as uncached plain-text deployment
metadata. `JOB_BOARDWALK_BROWSER_SESSION_ORIGIN` supplies an HTTP(S) origin whose hostname is
`127.0.0.1` or `localhost`, with no credentials, path beyond `/`, query, or fragment. An empty value
disables requests to Browser Session; Dashboard still rereads the configuration on each check.
The origin addresses the machine running the user's Dashboard browser. Caddy permits that origin
in its Content Security Policy, and the browser sends health requests directly to it.

Vite defaults to `http://127.0.0.1:54312` for source development.
[Deployment](../../docs/deployment.md#start-browser-session) owns the Compose configuration;
[Desktop Manager](../desktop-manager/README.md#lifecycle-boundary) supplies the desktop value from its service plan.

[Browser Session](../browser-session/README.md#health-and-runtime-diagnostics) owns health response
semantics and CORS permissions. Dashboard's current browser integration reads health only.
[Product design](../../docs/product-design.md#dashboard-as-a-browser-capability-client) defines how
future browser features share page coordination and user handoff.

## Report rendering

Dashboard renders each report as a document. It supports headings, prose, lists, tables, block
quotes, code, section anchors, Dashboard-local links, and HTTPS source links. Raw HTML remains text,
and Markdown images are not rendered.

Section anchors and Dashboard-local links stay in the current tab. HTTPS source links carry a `↗`
marker and open in a new tab, so readers can consult a source without losing their place in the
report. Report content cannot embed pages or expose browser or agent controls.

## Concurrency model

The Dashboard client owns one top-level shajara scope from mount until the document is discarded.
Service reads and user-initiated changes run as `RiteCoroutine` routines.
`fetch(...)` and response-body Promises enter those routines through `until(...)` at the HTTP leaf.
Solid owns reactive state, loading, and error presentation; the Dashboard runtime is the explicit
Promise boundary for Solid computations and event handlers.

Polling uses shajara waits rather than independent browser intervals. Each reactive read owns one
active request: recomputing or disposing that read cancels its routine and aborts its `fetch(...)`.
Discarding the document cancels the page scope and its remaining work, while the browser's
back/forward cache preserves that scope. Expected read and mutation failures remain local to their
UI operation instead of closing the page scope.

## Run Dashboard

Dashboard's production runtime is the root Compose deployment:

```sh
docker compose -f compose.yaml -f deploy/compose.build.yaml up --build --detach
```

The application-owned [`Caddyfile`](Caddyfile) defines Dashboard's production HTTP boundary. It
serves the built client, applies the restrictive browser security policy, handles SPA fallback,
and proxies `/api` to Workspace Service. Compose and desktop distribution run the same Caddyfile;
each release supplies its platform-native Caddy binary through the owning build boundary. Open
<http://127.0.0.1:54311>.

For source development, run Workspace Service and Dashboard in separate terminals:

```sh
pnpm exec moon run workspace-service:dev
pnpm exec moon run dashboard:dev
```

Open <http://127.0.0.1:54311>. Vite proxies `/api` requests to the Workspace Service at
<http://127.0.0.1:54310>.

## Development

Run the Dashboard checks with:

```sh
pnpm exec moon run \
  dashboard:lint \
  dashboard:typecheck \
  dashboard:test \
  dashboard:build
```
