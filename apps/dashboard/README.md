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
- The job library uses `/jobs` for all normalized jobs and `/jobs/interested` for the same library
  filtered to jobs with at least one platform source marked “感兴趣”. Both views provide search,
  platform filtering, available original source links, and server-backed pagination. The filtered
  view also shows when the interest state was last observed.
- `/reports` lists unexpired research reports, while `/reports/:id` renders one Markdown report.

The header is the only cross-page navigation. The job-library and “感兴趣” links show their current
counts, so the overview does not repeat those counts as separate sections.

## Data ownership and freshness

Workspace Service owns durable personal context, job-search intents, job facts and source
relations, platform-access observations, and reports. Browser Session owns browser runtime status.
Dashboard reads those models from Workspace Service; it does not access SQLite, Patchright, the
browser profile, or either service's lifecycle.

Saved platform observations are historical evidence rather than a guarantee of current access, so
their observation times remain visible. Browser Session presence is a separate short-lived lease.
Dashboard gives visual priority to an unavailable browser or an unresolved platform interruption
without opening or checking a recruiting page.

Browser interaction and login handoff happen between the agent, the
[`browser-session`](../browser-session/) application, and the visible platform window. Dashboard
does not open or control that window.

Dashboard rereads the workspace overview every five seconds and refreshes it after a user change.
The job-library page and its interested slice request at most 24 jobs at a time and refresh the
current result every 30 seconds. Research-report pages refresh every five seconds to reflect
updates to drafts and completed reports. These reads affect only the local Workspace Service API;
they never refresh a recruiting page.

## Report rendering

Dashboard treats raw HTML as text and does not load Markdown images. The renderer supports prose,
headings, lists, links, tables, quotes, code, section anchors, local Dashboard links, and HTTPS
source links. It is a document reader, not an agent UI or browser-control surface.

## Run Dashboard

Start the Workspace Service first, then run:

```sh
pnpm --filter @job-boardwalk/dashboard dev
```

Open <http://127.0.0.1:54311>. Vite proxies `/api` requests to the Workspace Service at
<http://127.0.0.1:54310>.

## Production-style preview

Build and preview the static client:

```sh
pnpm --filter @job-boardwalk/dashboard build
pnpm --filter @job-boardwalk/dashboard start
```

The preview still requires a separately running Workspace Service.

## Development

Run the Dashboard checks with:

```sh
pnpm --filter @job-boardwalk/dashboard lint
pnpm --filter @job-boardwalk/dashboard typecheck
pnpm --filter @job-boardwalk/dashboard test
pnpm --filter @job-boardwalk/dashboard build
```
