# Browser Session

Browser Session is Job Boardwalk's long-lived loopback HTTP MCP gateway to a user-owned graphical
Edge or Chrome session. It attaches through Patchright `chromium.connectOverCDP`, coordinates tabs
and page actions, and leaves recruiting-page meaning to the agent.

The graphical host owns the browser process, dedicated profile, cookies, and visible windows.
Browser Session never launches that process, copies its profile, reads cookies, or calls
`browser.close()`. Patchright attaches with `noDefaults: true` so connection setup does not replace
the default context's download, focus, or emulation settings.

Browser Session returns bounded page evidence. The agent interprets that evidence, reconciles it
with what the user sees, and decides whether a durable Workspace Service observation is justified.

The current tool surface is limited to BOSS HTTPS pages. Membership in that URL scope permits only
research navigation; it does not authorize an account action.

## Driver compatibility

Patchright replaces Playwright at the driver boundary because enabling `Runtime` made BOSS navigate
itself to `about:blank` during live testing. Patchright keeps the familiar page API without enabling
that CDP domain. Browser Session also leaves console event collection disabled; do not add
Playwright or raw `Runtime.enable`/`Console.enable` calls alongside it.

## Start the graphical browser

Completely exit any existing process that would reuse the same Edge instance, then start a dedicated
profile on the graphical host. A Windows Edge example is:

```powershell
msedge.exe `
  --remote-debugging-port=9222 `
  --remote-debugging-address=0.0.0.0 `
  --remote-allow-origins=http://localhost `
  --user-data-dir=C:\edge-job-boardwalk
```

`http://localhost` is the fixed Origin sent by Browser Session and is therefore the only required
`remote-allow-origins` value. Do not use `*`. Origin filtering is not authentication because a
non-browser client can forge the header; restrict the debugging port with the host firewall to the
WSL/VM boundary and never expose it to a LAN or the internet.

## Run Browser Session

Provide the CDP URL in the process environment. Project entrypoints do not load `.env` themselves.

```sh
export JOB_BOARDWALK_CDP_URL=http://172.19.0.1:9222
pnpm --filter @job-boardwalk/browser-session dev
```

When standard `HTTP_PROXY`/`NO_PROXY` resolution selects a proxy, Browser Session creates a
loopback-only TCP CONNECT tunnel so both CDP discovery and the subsequent WebSocket use the same
route. Override this choice explicitly when necessary:

```sh
export JOB_BOARDWALK_CDP_PROXY_URL=http://172.19.0.1:7897
```

Set `JOB_BOARDWALK_CDP_PROXY_URL` to an empty value to require a direct connection. The selected
proxy must support HTTP CONNECT to the CDP port.

For a built run:

```sh
pnpm --filter @job-boardwalk/browser-session build
node apps/browser-session/dist/browser-session.js
```

The Streamable HTTP MCP endpoint is <http://127.0.0.1:54312/mcp>; connection health is available at
<http://127.0.0.1:54312/health>. The service binds to loopback and rejects non-local browser
origins, but this is not authentication: local processes are inside the service trust boundary.

## Runtime behavior

### Connection lifecycle

One top-level shajara scope owns the HTTP server, optional CONNECT tunnel, Patchright connection,
reconnection loop, and shutdown. Browser Session reconnects with bounded exponential backoff when
the CDP browser disappears. It never replays a failed page action because the visible outcome may
already have occurred.

MCP actions, tab coordination, and snapshots remain `RiteCoroutine` routines. Patchright and Node
Promises are adapted with `until(...)` at the leaf SDK call; application-owned waits use shajara
primitives. Promise-returning adapters remain only at the HTTP, process-entry, and external-resource
boundaries.

Service shutdown detaches only the local Patchright transport. It never sends `Browser.close`, so
restarting Browser Session or the agent host does not close the graphical browser or its tabs.

### Tabs and page evidence

Only BOSS HTTPS tabs are exposed through the current MCP contract. This URL scope authorizes
research navigation, not account actions. The service can list, open, and activate in-scope tabs;
it does not expose a tab-close action.

Snapshots bound rendered text, element count, element names, and link lengths, and report any
clipping through `truncated`. They omit all form-control values and do not expose password controls.
Before using a ref, Browser Session verifies that the referenced element still matches the latest
snapshot. Explicit links outside BOSS HTTPS scope are rejected before clicking, and every action
must still finish on an in-scope page. Click, fill, selection, scrolling, and navigation use
Patchright page APIs.

## Agent responsibility and handoff

The agent paces actions and interprets snapshots. Login, verification, credentials, applications,
messages, and account changes remain under user control. When one appears, the agent stops browser
input and asks the user to take over the same visible tab. It resumes only after the user explicitly
returns control and the live page is observed again.

## Development

Tests cover the public tool contract, URL and Origin boundaries, bounded inputs, reconnect behavior,
and the optional proxy tunnel. Driver internals and reader-facing prose are not test contracts.

```sh
pnpm --filter @job-boardwalk/browser-session lint
pnpm --filter @job-boardwalk/browser-session typecheck
pnpm --filter @job-boardwalk/browser-session test
pnpm --filter @job-boardwalk/browser-session build
```
