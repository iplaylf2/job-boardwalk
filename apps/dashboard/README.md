# Dashboard

Dashboard is Job Boardwalk's read-only local dashboard. It presents durable workspace information
assembled by the user, agent, and Browser Session. For each platform, it shows the latest definite
authentication observation and any later unresolved access interruption, together with observation
times. These records do not guarantee the current authentication state. Dashboard does not own
SQLite, browser sessions, Playwright, or the Workspace Service lifecycle.

Browser interaction and login handoff happen between the agent, the
[`browser-session`](../browser-session/) application, and the visible platform window. Dashboard
does not open or control that window.

The **重新读取本地记录** button fetches the workspace overview from Workspace Service again. It
does not open, navigate, or refresh a browser page.

## Development

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
