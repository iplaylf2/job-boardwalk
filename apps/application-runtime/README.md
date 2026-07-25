# Application Runtime

Application Runtime is Job Boardwalk's directory-contained service coordinator. Its Node.js single
executable starts Workspace Service and Dashboard Host as isolated roles, waits for their loopback
health boundaries, and owns their ordered shutdown under one top-level shajara scope.

Dashboard Host serves the finalized Dashboard artifact, applies its production browser-security
headers, preserves SPA fallback, and proxies `/api` to Workspace Service. It replaces Caddy in
desktop staging and the target installed topology. Compose remains the supported deployment
topology while the desktop lifecycle is incomplete.

The runtime derives all packaged paths from its executable under `Job Boardwalk/bin/`. It gives
Workspace Service the migrations under `payload/migrations/` and database under
`data/workspace.sqlite`; Dashboard Host reads `payload/dashboard/`. Packaged roles do not consult
the current working directory or ambient path overrides. The shared
[`@job-boardwalk/desktop-product-layout`](../../packages/desktop-product-layout/) package owns
these path names; Application Runtime consumes that contract rather than duplicating assembler
destinations.

Browser Session is not supervised by this implementation yet. Supported-system-browser discovery,
its in-directory profile, lifecycle diagnostics, and the bounded Desktop Manager protocol belong
to the next desktop-lifecycle stage.

## Build

```sh
pnpm exec moon run application-runtime:build
```

The build bundles the supervisor and Dashboard Host, then uses Node.js single-executable
application support to write `target/release/job-boardwalk-runtime` (or the platform executable
equivalent). Its Workspace Service role loads the application's finalized bundled module from the
product payload. Neither path requires a system Node.js installation or `node_modules`.

Run direct checks with:

```sh
pnpm exec moon run \
  application-runtime:lint \
  application-runtime:typecheck \
  application-runtime:test
```
