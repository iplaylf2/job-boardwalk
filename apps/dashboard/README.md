# Dashboard

The dashboard presents durable workspace information and lets the user request a visible platform
window. It does not own SQLite, Chromium profiles, Playwright sessions, authentication detection,
or the runtime lifecycle.

## Development

Start the local runtime first, then run:

```sh
pnpm --filter @job-boardwalk/dashboard dev
```

Open <http://127.0.0.1:4311>. Vite proxies `/api` requests to the runtime at
<http://127.0.0.1:4310>.

## Production-style preview

Build and preview the static client:

```sh
pnpm --filter @job-boardwalk/dashboard build
pnpm --filter @job-boardwalk/dashboard start
```

The preview still requires a separately running local runtime.
