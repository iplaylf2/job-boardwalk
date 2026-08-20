# Dashboard

Dashboard is Job Boardwalk's local reading and maintenance surface for durable workspace data. It
organizes the current research basis, normalized job library, and research reports, while showing
leased Browser Session presence and timestamped platform-access evidence. It remains useful without
an active agent conversation and never controls the browser.

## Reader path

The interface has three primary reader paths:

- `/` presents the selected job-search intent and personal context. Personal facts are read-only by
  default and can all be expanded in place; a separate management surface owns creating, revising,
  selecting, and removing intents and facts. Browser and platform status remains a compact
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
relations, platform-access observations, and reports. Browser Session owns browser runtime status.
Dashboard reads those models from Workspace Service; it does not access SQLite, Patchright, the
browser profile, or either service's lifecycle.

When Workspace Service data cannot be loaded, Dashboard keeps the page header and primary
navigation visible. The affected data region reports the failure instead of presenting it as an
empty result; retryable failures offer a retry action.

Saved platform observations are historical evidence rather than a guarantee of current access.
Dashboard therefore presents definite authentication in the past tense and shows when the displayed
authentication or interruption assessment was most recently observed. Browser Session presence is
a separate short-lived lease. Dashboard gives visual priority to an unavailable browser or an
unresolved platform interruption without opening or checking a recruiting page.

Browser interaction and login handoff happen between the agent, the
[`browser-session`](../browser-session/) application, and the visible platform window. Dashboard
does not open or control that window.

Dashboard rereads the workspace overview every five seconds and refreshes it after a user change.
The job-library page requests at most 24 jobs at a time and refreshes the selected view every 30
seconds. Research-report pages refresh every five seconds to reflect updates to drafts and completed
reports. These reads affect only the local Workspace Service API; they never refresh a recruiting
page.

## Report rendering

Dashboard treats raw HTML as text and does not load Markdown images. The renderer supports prose,
headings, lists, links, tables, quotes, code, section anchors, local Dashboard links, and HTTPS
source links. It is a document reader, not an agent UI or browser-control surface.

## Concurrency model

The Dashboard client owns one top-level shajara scope from mount until the document is discarded.
Reads from Workspace Service and user-initiated changes run as `RiteCoroutine` routines.
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
