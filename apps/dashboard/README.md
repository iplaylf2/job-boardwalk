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
- `/jobs` presents the normalized job library with search, platform, engagement, and description
  filters. Cards show collected facts, platform sources, and retained descriptions. See
  [Job library](#job-library) for source status and evidence displays.
- `/reports` lists saved research reports, while `/reports/:id` renders one Markdown report.
  See [Report rendering](#report-rendering) for presentation and link behavior.

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

The platform-access panel presents Workspace Service's summaries with the latest observation time;
source page URLs are omitted from this compact view. Authentication labels use the past tense. An
unresolved interruption takes precedence in the panel; Dashboard does not open or inspect recruiting
pages.

Dashboard rereads the workspace overview every five seconds and refreshes it after a user change.
The job-library page requests at most 24 jobs at a time and refreshes the selected view every 30
seconds. Research-report pages refresh every five seconds. These reads use Workspace Service's
local API and do not refresh recruiting pages.

## Job library

The library's engagement navigation selects all tracked jobs or one platform-observed category:
`interested`, `contacted`, `applied`, or `interviewed`. These are filters on the same collection.
Description coverage counts jobs with a retained description, jobs without one, and the subset
that also lacks a platform job ID and detail-page link. The description filter selects those groups;
Workspace Service owns the [query semantics](../workspace-service/README.md#library-queries-and-description-coverage).

Cards focus on comparable job facts and source evidence. Each source row shows recorded engagements,
recruitment status, and a link when a detail URL is available. Conclusive recruitment states include
their observation date. Missing and unknown recruitment assessments display “招聘状态未判定”;
empty engagements display “未记录跟进”. The footer shows the latest engagement observation date,
or the job's update date when no engagement is recorded.

A card offers a description dialog when a retained description is available. The dialog reports
local length clipping when present. Only one description is open at a time; closing it preserves
the list context. On narrow screens, the dialog fills the viewport and keeps its header visible
while the description scrolls. Source status and description availability are independent:
a closed posting can still have a readable description.

## Optional Browser Session health checks

The overview's browser-service panel reads the configured Browser Session's `/health` directly.
Each `BrowserSessionCheckResult` records a check time and an `outcome`: `unconfigured`,
`configuration-error`, `failed`, or `observed`. A failed read establishes neither that the service
is stopped nor why the check failed.

An observed response supplies runtime availability. For an available runtime, the panel uses its
control state to distinguish an active session, handoff preparation, and user control. When an access interruption is retained,
it shows that observation's platform, date and time, and source URL. The URL identifies the recorded
interruption; the page may since have closed or navigated. This current-session read is independent
of the platform-access history displayed from Workspace Service.

Each check has a three-second deadline and runs every five seconds while the overview is mounted;
leaving the page cancels pending requests. Workspace content and this health check have separate
loading and failure boundaries.

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
[Product design](../../docs/product-design.md#dashboard-as-a-browser-capability-client) defines the
application boundary and user-handoff requirements.

## Report rendering

The report list shows titles and update times, with the most recently updated reports first.
Selecting a title opens the saved Markdown body with the same title and update time.
[Workspace Service](../workspace-service/README.md#research-reports) owns report storage and queries.

Dashboard renders each report as a document. It supports headings, prose, lists, tables, block
quotes, and code. Raw HTML remains text, and Markdown images are not rendered.

Links beginning with `#` or a single `/` stay in the current tab; headings do not receive automatic
anchor IDs. HTTPS links carry a `↗` marker and open in a new tab, so readers can consult a source
without losing their place in the report. Other link destinations are not rendered as links.
Report content cannot embed pages or expose browser or agent controls.

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
