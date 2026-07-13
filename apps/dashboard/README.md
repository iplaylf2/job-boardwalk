# Dashboard

Dashboard is Job Boardwalk's local read surface. It presents durable workspace information
assembled by the user, agent, and browser observer. Platform access is shown as a timestamped last
observation with its evidence strength, not as a live authentication guarantee. The dashboard does
not own SQLite, browser sessions, Playwright, or the Workspace Service lifecycle.

Browser interaction and login handoff happen between the agent, the
[`browser-session`](../browser-session/) application, and the visible platform window. The
Dashboard does not open or control that window.

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
