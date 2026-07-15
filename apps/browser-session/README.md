# Browser Session

Browser Session is Job Boardwalk's long-lived loopback HTTP MCP service for a visible persistent
browser. It launches Patchright Chromium, owns the dedicated profile and browser process, coordinates
tabs and page actions, and leaves recruiting-platform page meaning to the agent.

The dedicated profile survives service restarts and is never shared with another application.
Browser Session tools never read or return cookies, browser storage, or profile contents. Their
bounded page evidence lets the agent reconcile automation results with the window the user can see.

The current tool surface supports both BOSS直聘 and 鱼泡直聘 through one recruiting-platform
adapter contract. A platform's HTTPS navigation scope permits research navigation only; it does not
authorize account actions.

## Run Browser Session

Browser Session requires a graphical desktop session and Patchright's Chromium binary. It does not
require a particular operating system, shell, VM, container, or editor.

Install the browser once:

```sh
pnpm --filter @job-boardwalk/browser-session exec patchright install chromium
```

Then run the service:

```sh
pnpm --filter @job-boardwalk/browser-session dev
```

For a built run:

```sh
pnpm --filter @job-boardwalk/browser-session build
node apps/browser-session/dist/browser-session.js
```

By default, the dedicated browser profile is stored under the operating system's user data
directory. Set `JOB_BOARDWALK_BROWSER_PROFILE_PATH` to choose an exact path. Browser Session does
not share this path or profile with another service. Project entrypoints do not load `.env`
themselves.

Every five seconds, Browser Session sends Workspace Service a bounded status report containing
browser availability, version, tab count, and the latest browser error when unavailable. Set
`JOB_BOARDWALK_WORKSPACE_SERVICE_URL` when Workspace Service is not available at
<http://127.0.0.1:54310>. Reporting is best-effort: failures are retried and never stop browser
control.

The Streamable HTTP MCP endpoint is <http://127.0.0.1:54312/mcp>; health is available at
<http://127.0.0.1:54312/health>. The service binds to loopback and rejects non-local browser origins,
but this is not authentication: local processes are inside the service trust boundary.

## Runtime behavior

### Browser lifecycle

One top-level shajara scope owns the HTTP server, visible browser process, persistent context,
Workspace Service status reporter, recovery loops, and shutdown. If the browser window is closed
unexpectedly, Browser Session reports the interruption and launches it again with bounded
exponential backoff. It never replays a failed page action because the visible outcome may already
have occurred.

MCP actions, tab coordination, and snapshots run as `RiteCoroutine` routines. Patchright and Node
Promises are adapted with `until(...)` at the leaf SDK call; application-owned waits use shajara
primitives. Promise-returning adapters remain only at the HTTP, process-entry, and external-resource
boundaries.

Stopping Browser Session closes the browser it owns. The persistent profile retains ordinary client
state for the next service run.

### Tabs and page evidence

Tabs for BOSS直聘 and 鱼泡直聘 are discovered, selected, validated, and controlled through the same
adapter-driven workflow. `browser_tabs ensure` requires a `platformId` (`boss` or `yupao`), then
reuses a tab for that platform before creating one at its catalog entry URL. The service can list
and activate all in-scope tabs, but does not expose unconditional tab creation or a tab-close
action. Each adapter owns only the platform identity, entry URL, label, and HTTPS hostname rule;
page actions remain platform-independent.

Snapshots bound rendered text, element count, element names, and link lengths, and report any
clipping through `truncated`. They omit all form-control values and do not expose password controls.
Before using a ref, Browser Session verifies that the referenced element still matches the latest
snapshot. Explicit links outside the current tab's platform scope are rejected before clicking,
and every action must still finish on a supported platform page. Click, fill, selection, scrolling,
and navigation use Patchright page APIs.

## Agent responsibility and handoff

The agent paces actions and interprets snapshots. Login, verification, credentials, applications,
messages, and account changes remain under user control. When research reaches one of these actions,
the agent stops browser input and asks the user to take over the same visible tab. It resumes only
after the user explicitly returns control and the live page is observed again.

## Maintenance constraints

The adapter registry is exhaustive over the catalog's `PlatformId` type. Adding a recruiting
platform therefore requires both catalog metadata and a Browser Session adapter; TypeScript rejects
a registry that omits the new platform. Platform-specific page interpretation does not belong in
the adapter or Browser Session.

Patchright replaces Playwright at the driver boundary because enabling the Runtime protocol domain
made BOSS navigate itself to `about:blank` during live testing. Patchright keeps the familiar page
API without enabling that domain. Browser Session also leaves console event collection disabled; do
not add Playwright or raw `Runtime.enable`/`Console.enable` calls alongside it.

## Development

Tests cover the public tool contract, URL and Origin boundaries, bounded inputs, browser-context
behavior, and lifecycle ownership. Driver internals and reader-facing prose are not test contracts.

```sh
pnpm --filter @job-boardwalk/browser-session lint
pnpm --filter @job-boardwalk/browser-session typecheck
pnpm --filter @job-boardwalk/browser-session test
pnpm --filter @job-boardwalk/browser-session build
```
