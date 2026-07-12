# Dashboard

The dashboard is the SolidJS client for Job Boardwalk's state service. It owns presentation only;
filesystem access, SQLite persistence, Chromium profiles, and the server lifecycle remain outside
its boundary.

```sh
pnpm --filter @job-boardwalk/dashboard dev
```

Open <http://127.0.0.1:4311>. Vite proxies `/api` requests to the state service at
<http://127.0.0.1:4310>.

For a production-style static preview:

```sh
pnpm --filter @job-boardwalk/dashboard build
pnpm --filter @job-boardwalk/dashboard start
```

The dashboard requires the state service for both development and preview. Start the service
separately before opening either version.
