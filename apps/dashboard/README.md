# Dashboard

Dashboard is Job Boardwalk's local interface. It presents durable Workspace Service data and
research reports, and lets the user maintain personal context and job-search intents. Each intent
combines a target position, city, and per-platform recommendation-page associations. At most one is
selected as the current research direction, enabling passive collection while selected. Dashboard
remains useful without an active agent conversation and never controls the browser.

The interface has three primary destinations:

- `/` centers the selected search direction and its personal context, with browser and access
  health kept in a secondary status rail;
- `/jobs` is the job-library workspace for search, platform filtering, source links, and paginated
  browsing;
- `/reports` lists unexpired research reports, while `/reports/:id` renders one Markdown report.

The header is the only cross-page navigation. Its job-library link includes the current job count,
so the overview does not repeat the same destination in a summary card.

## What Dashboard does

Dashboard:

- shows leased Browser Session presence and browser availability;
- shows each platform's latest definite authentication observation and any later unresolved
  interruption;
- lets the user add, update, select, and remove job-search intents and their BOSS直聘/鱼泡直聘
  recommendation-page associations;
- lets the user add, update, and remove other personal details;
- provides a searchable library of jobs discovered during directed platform research, with a
  platform filter and server-backed pagination;
- displays confident cross-platform matches as one job while retaining each recruiting-site link;
- lists unexpired research reports and renders them within a bounded Markdown surface.

Observation times remain visible because saved platform observations are historical; they do not
guarantee the platform's current authentication state. Browser Session presence is separate,
short-lived runtime state. Workspace Service owns the durable data and Browser Session owns the
runtime status. Dashboard owns neither source: it does not access SQLite, Patchright, the browser
profile, or either service's lifecycle.

Browser interaction and login handoff happen between the agent, the
[`browser-session`](../browser-session/) application, and the visible platform window. Dashboard
does not open or control that window.

Dashboard rereads the workspace overview every five seconds and refreshes it after a user edit.
The job-library page requests at most 24 jobs at a time and refreshes the current result every 30
seconds. Research-report pages refresh every five seconds to reflect edits to open drafts and
completed reports. These reads affect only the local Workspace Service API; they never refresh a
recruiting page.

Dashboard treats raw HTML as text and does not turn Markdown image syntax into loaded images. The
renderer supports ordinary document structure, tables, code, section anchors, local Dashboard
links, and HTTPS source links. It is a document reader, not an agent UI or browser-control surface.

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
pnpm --filter @job-boardwalk/dashboard build
```
