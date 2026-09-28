# Dashboard

Dashboard is Job Boardwalk's local reading and maintenance surface for durable workspace data. It
helps users maintain their research criteria, revisit collected jobs, and read research findings.
Workspace Service is its only application-service dependency, so saved content remains accessible
without a running browser or agent conversation. Dashboard does not call Browser Session.

## Reader path

The interface has three primary reader paths:

- `/` presents the selected job-search intent and personal context. Personal facts are read-only by
  default and can all be expanded in place; a separate management surface owns creating, revising,
  selecting, and removing intents and facts.
- `/jobs` presents the normalized job library with search, platform, engagement, and description
  filters. Cards show collected facts, platform sources, and retained descriptions. See
  [Job library](#job-library) for source status and evidence displays.
- `/reports` lists saved research reports, while `/reports/:id` renders one Markdown report.
  See [Report rendering](#report-rendering) for presentation and link behavior.

The header owns only cross-resource navigation. Engagement filters belong to the job library and do
not appear as primary destinations.

## Data ownership and freshness

Dashboard reads personal context, job-search intents, job facts and source relations, and reports
through Workspace Service's HTTP API. The overview displays the response's personal context and
job-search intents. Dates and source evidence in the job library help users assess saved jobs;
research reports provide the author's findings and their supporting evidence.

When Workspace Service data cannot be loaded, Dashboard keeps the page header and primary
navigation visible. The affected data region reports the failure instead of presenting it as an
empty result; retryable failures offer a retry action.

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
