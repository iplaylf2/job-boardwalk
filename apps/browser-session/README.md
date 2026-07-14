# Browser Session

Browser Session is Job Boardwalk's MCP gateway to a user-visible browser. It does not launch a
browser or own a browser profile. Instead, it supervises one Streamable HTTP client at a time for a
Playwright MCP server running beside Chrome or Edge on the graphical host, then exposes the ready
upstream browser tools over stdio to any MCP-capable agent host.

The graphical host owns the official Playwright Extension, browser process, profile, cookies, and
visible tabs. Browser Session owns the upstream connection lifecycle, handoff instructions,
tool-result redaction, and collection of platform-access evidence. Workspace Service owns the
resulting durable observations, while the agent conversation owns whether control currently belongs
to the user or agent.

## Required upstream service

Install the official Playwright Extension from the browser's extension store. On the graphical
host, run Playwright MCP with extension and HTTP transport enabled. For example, when the extension
is installed in Edge and Browser Session can reach the graphical host over loopback:

```sh
pnpm dlx -y @playwright/mcp@latest \
  --extension \
  --browser msedge \
  --port 8931 \
  --shared-browser-context
```

Use `--browser chrome` when the extension is installed in Chrome. If Browser Session runs across a
VM, WSL, or container boundary, bind the upstream service to an appropriate host address, allow
the exact `host:port` value with `--allowed-hosts`, and restrict the port to the agent environment
with the host firewall. Playwright MCP is a browser-control surface, not a public network service.

Keep the Playwright MCP process, the browser window it opens, and the extension-bound tab open for
the entire Browser Session. Closing any of them breaks the live browser binding; reconnecting
Browser Session cannot recreate browser state owned by the graphical host.

If the Playwright Extension uses token mode, keep that token in the graphical host's Playwright MCP
process. Browser Session connects to the MCP endpoint and never needs or stores the extension
token. Upstream tool results are redacted before they reach the downstream agent because the
extension connection URL can contain the token.

## Register Browser Session

Build Browser Session before registering it with the agent host:

```sh
pnpm --filter @job-boardwalk/browser-session build
```

Configure the host to launch `node` with the absolute path to
`apps/browser-session/dist/browser-session-server.js`. The host owns this stdio child process, and
its stdout contains only MCP JSON-RPC. The equivalent command from the repository root is:

```sh
JOB_BOARDWALK_PLAYWRIGHT_MCP_URL=http://127.0.0.1:8931/mcp \
  node apps/browser-session/dist/browser-session-server.js
```

Agent-host registrations should use absolute paths for both the Node executable and built entry point
because their working directory and `PATH` are not part of the Browser Session contract.

Do not start a separate Browser Session process before connecting the agent host. The stdio process
belongs to the host that consumes it. After changing Browser Session configuration or code, restart
its MCP registration through the host, or restart the agent extension if the host has no per-server
restart. Rebuild Browser Session before restarting when source code changed. Do not restart the
graphical browser, Workspace Service, or Dashboard.

Set `JOB_BOARDWALK_WORKSPACE_SERVICE_URL` only when Workspace Service is not available at its
default `http://127.0.0.1:54310` address. The root
[`.env.example`](../../.env.example) documents the supported variables. Project scripts do not
load `.env`; supply variables through the shell or agent host. MCP registration in the agent host
remains separate local configuration. Workspace Service must be reachable whenever
`browser_open_platform` or `browser_observe_platform_access` produces a definite observation;
ordinary forwarded browser tools do not write to it.

A missing or malformed `JOB_BOARDWALK_PLAYWRIGHT_MCP_URL` is a Browser Session configuration error
and fails process startup. Once a valid endpoint is configured, endpoint reachability and extension
binding are supervised dependencies that may recover without restarting Browser Session.

## Connection lifecycle

Browser Session starts its downstream stdio transport immediately and supervises at most one
upstream client at a time. MCP protocol initialization, tool discovery, and downstream shutdown do
not depend on the graphical host. Stable Browser Session workflows remain discoverable while the
upstream connection is unavailable; calls that require the upstream return an explicit unavailable
result with the latest redacted connection error. Failed upstream connection attempts and lost live
connections stay inside the supervisor, which makes paced reconnect attempts. When a connection
becomes ready or unavailable, Browser Session notifies the agent host that its optional upstream
tool list changed. Core platform-access workflows do not depend on the agent host refreshing that
dynamic list.

As soon as the upstream connection is ready, Browser Session calls `browser_tabs(list)` once to bind
Playwright's current page to the tab selected by the extension. This ordering is required:
navigating before tab initialization causes Playwright MCP to create a separate temporary tab.
Later browser tools reuse the initialized tab.

An upstream tool result marked as an error, or a rejected tool request while the connection remains
open, is contained to that request. An explicit connection closure withdraws the forwarded tools and
starts a fresh connection attempt without stopping the downstream service. Browser Session never
replays a failed browser action because the visible action may already have happened even when its
response was lost. The agent must re-observe the live page before deciding whether a new action is
safe.

The process owns one top-level shajara scope. A race owned by that scope coordinates the shutdown
signal and connection supervisor; shutdown cancels the supervisor before closing the downstream
transport. MCP tool handlers enter the same scope. Browser Session keeps its application workflow
in `RiteCoroutine` routines; Promise interop is confined to MCP SDK, HTTP, and process-entry
boundaries through `until(...)`.

## Platform access workflows

Browser Session always exposes two platform-access workflows:

| Tool                              | Browser effect                                                                      | Durable effect                       |
| --------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------ |
| `browser_open_platform`           | Navigates to the catalog-owned platform entry, then observes the visible page once. | Saves a definite access observation. |
| `browser_observe_platform_access` | Observes the current visible page once without navigating or refreshing.            | Saves a definite access observation. |

Both tools return `authenticated`, `login-required`, `verification-required`, `access-denied`, or
`indeterminate`. An `indeterminate` result means the visible evidence is insufficient and is not
saved. Neither tool enters credentials, completes verification, or continues to another page after
its observation. Because a definite result may be saved, neither tool is declared read-only.

Research workflows may invoke `browser_observe_platform_access` automatically after meaningful
state changes and may use bounded, paced navigation, retries, or necessary refreshes around it.
They must avoid tight polling loops and repeated visible page churn. An observation does not read
cookie values or infer an interruption from a route name alone.

## User handoff

When a page requires login, verification, or credentials—or when the next action would submit an
application, send a message, or change account state—the agent stops browser input and the user
takes over the same visible tab. Browser Session does not intentionally close the tab or upstream
connection during the handoff. The agent resumes input only after the user explicitly returns
control and then re-observes the live page before continuing.

## Development

```sh
pnpm --filter @job-boardwalk/browser-session lint
pnpm --filter @job-boardwalk/browser-session typecheck
pnpm --filter @job-boardwalk/browser-session test
pnpm --filter @job-boardwalk/browser-session build
```
