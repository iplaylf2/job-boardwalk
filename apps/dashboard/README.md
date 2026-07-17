# Dashboard

Dashboard is Job Boardwalk's local interface. It shows durable Workspace Service data and lets the
user maintain the personal context that guides the agent, including target locations. It remains
useful without an active agent conversation and never controls the browser.

## What Dashboard does

The page:

- shows leased Browser Session presence and browser availability;
- shows each platform's latest definite authentication observation and any later unresolved
  interruption;
- lets the user add, update, and remove personal details and target locations.

Observation times remain visible because saved platform observations are historical; they do not
guarantee the platform's current authentication state. The explanatory copy distinguishes a
successful protected navigation from an authenticated session confirmed through visible,
account-specific page content. Browser Session presence is separate, short-lived runtime state.
Workspace Service owns the durable data and Browser Session owns the runtime status. Dashboard owns
neither source: it does not access SQLite, Patchright, the browser profile, or either service's
lifecycle.

Browser interaction and login handoff happen between the agent, the
[`browser-session`](../browser-session/) application, and the visible platform window. Dashboard
does not open or control that window.

Dashboard rereads the workspace overview every five seconds and refreshes it after a user edit.
This affects only the local Workspace Service API; it never opens, navigates, or refreshes a
browser page.

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
