# Desktop Runtime

Desktop Runtime coordinates the services inside Job Boardwalk's directory-contained desktop
product. Its Node.js single executable starts Workspace Service, Dashboard Host, and Browser
Session as isolated child processes, waits for their loopback health endpoints, reports failures
to Desktop Manager, and shuts the services down in reverse order.

The coordinator uses shajara internally for its cancellable waits, races, and cleanup. That scope
does not contain the child services or cross a process boundary. Each service process governs its
own internal concurrency and state.

## Runtime responsibilities

Dashboard Host serves the finalized Dashboard artifact, applies its production browser-security
headers, preserves SPA fallback, and proxies `/api` to Workspace Service. It replaces Caddy in
the desktop product; it does not replace Caddy in the supported Compose topology.

Desktop Runtime derives packaged paths from its executable under `Job Boardwalk/bin/`:

- Workspace Service receives `payload/migrations/` and `data/workspace.sqlite`.
- Dashboard Host reads `payload/dashboard/`.
- Browser Session loads `payload/browser-session.cjs` and uses `data/browser-profile/`.

Packaged roles do not resolve resources from the current working directory or ambient path
overrides. The shared
[`@job-boardwalk/desktop-product-layout`](../../packages/desktop-product-layout/) package owns
these paths for Desktop Runtime and Desktop Distribution.

## System browser discovery

Before starting services, the coordinator's internal system-browser discovery checks installed
Chrome and Edge candidates. It reports whether it recognized a candidate, found one it could not
inspect, or found none. Desktop Runtime passes a recognized candidate to Browser Session for a
launch attempt; Browser Session startup and health determine whether it is operational. Workspace
Service and Dashboard Host still start when no candidate is recognized.

Source development may set `JOB_BOARDWALK_BROWSER_EXECUTABLE_PATH` to inspect one explicit
candidate. Installed runs use the platform candidate list and do not depend on that override.

## Manager protocol

Desktop Manager sends commands on the runtime's standard input and receives status events on
standard output through the versioned, length-delimited
[desktop lifecycle protocol](../../proto/job_boardwalk/desktop_lifecycle/v1/desktop_lifecycle.proto).
Service output is redirected to standard error so it cannot be mistaken for a protocol frame.

## Build

```sh
pnpm exec moon run desktop-runtime:build
```

Moon models the build as two artifacts: Vite first writes the single CommonJS runtime bundle, then
Node.js's built-in `--build-sea` command writes
`target/release/job-boardwalk-desktop-runtime` or its platform equivalent. The application-owned
SEA adapter supplies the output name and Node configuration; Vite and Node retain bundling and
single-executable construction. Workspace Service and Browser Session roles load finalized
bundles from the product payload. No packaged role requires a system Node.js installation or
`node_modules`.

Run direct checks with:

```sh
pnpm exec moon run \
  desktop-runtime:lint \
  desktop-runtime:typecheck \
  desktop-runtime:test
```
