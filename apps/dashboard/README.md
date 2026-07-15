# Dashboard

Dashboard is Job Boardwalk's read-only local view of Workspace Service data. It remains useful
without an active agent conversation and never controls the browser.

## What Dashboard shows

The page shows:

- leased Browser Session presence and browser availability;
- each platform's latest definite authentication observation and any later unresolved interruption;
- profile facts and target locations.

Observation times remain visible because saved platform evidence is historical; it does not
guarantee the platform's current authentication state. Browser Session presence is separate,
short-lived runtime state. Dashboard owns neither state source: it does not own SQLite, Browser
Session, Patchright, or the Workspace Service lifecycle.

Browser interaction and login handoff happen between the agent, the
[`browser-session`](../browser-session/) application, and the visible platform window. Dashboard
does not open or control that window.

Dashboard refreshes the workspace overview every five seconds. `刷新工作区` requests an immediate
refresh. Neither action opens, navigates, or refreshes a browser page.

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
