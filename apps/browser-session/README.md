# Browser Session

Browser Session is Job Boardwalk's MCP gateway to a user-visible browser. It does not launch a
browser or own a browser profile. Instead, it keeps one Streamable HTTP client connected to a
Playwright MCP server running beside Chrome or Edge on the graphical host, then exposes the
upstream browser tools over stdio to any MCP-capable agent host.

The graphical host owns the official Playwright Extension, browser process, profile, cookies, and
visible tabs. Browser Session owns the persistent upstream connection, handoff instructions,
tool-result redaction, and collection of platform-access evidence. Workspace Service owns the
resulting durable observations, while the agent conversation owns whether control currently belongs
to the user or agent.

## Required upstream service

Install the official Playwright Extension from the browser's extension store. On the graphical
host, run a compatible Playwright MCP release with extension and HTTP transport enabled. For
example, when the extension is installed in Edge:

```sh
npx @playwright/mcp@0.0.78 \
  --extension \
  --browser msedge \
  --port 8931 \
  --shared-browser-context
```

Use `--browser chrome` when the extension is installed in Chrome. If Browser Session runs across a
VM, WSL, or container boundary, bind the upstream service to an appropriate host address, allow
the exact `host:port` value with `--allowed-hosts`, and restrict the port to the agent environment
with the host firewall. Playwright MCP is a browser-control surface, not a public network service.

The Playwright Extension token may be configured only in the graphical host's Playwright MCP
process. Browser Session never needs or stores it. Upstream tool results are redacted before they
reach the downstream agent because the extension connection URL can contain that token.

## Register Browser Session

Register Browser Session as a stdio MCP server in the agent host. The host must launch this command
with the upstream MCP endpoint in its environment:

```sh
JOB_BOARDWALK_PLAYWRIGHT_MCP_URL=http://127.0.0.1:8931/mcp \
  pnpm --filter @job-boardwalk/browser-session mcp
```

Do not start a separate Browser Session process before connecting the agent host. The stdio process
belongs to the host that consumes it. After changing Browser Session configuration or code, restart
its MCP registration through the host, or restart the agent extension if the host has no per-server
restart. Do not restart the graphical browser, Workspace Service, or Dashboard.

Set `JOB_BOARDWALK_WORKSPACE_SERVICE_URL` only when Workspace Service is not available at its
default `http://127.0.0.1:54310` address. The root
[`.env.example`](../../.env.example) documents the supported variables. Project scripts do not
load `.env`; supply variables through the shell or agent host. MCP registration in the agent host
remains separate local configuration. Workspace Service must be reachable whenever
`browser_observe_platform_access` saves an observation; ordinary forwarded browser tools do not
write to it.

## Connection lifecycle

Browser Session starts its downstream stdio transport immediately, while establishing exactly one
upstream client in the same process lifetime. MCP protocol initialization, initial tool discovery,
and downstream shutdown therefore do not wait for the graphical host. While the upstream connection
is pending, tool discovery exposes the Browser Session-owned observation tool without blocking.
After the connection is ready, Browser Session notifies the agent host that the forwarded browser
tools are available. Browser tool calls wait for the scoped upstream resource.

As soon as the upstream connection is ready, Browser Session calls `browser_tabs(list)` once to bind
Playwright's current page to the tab selected by the extension.
This ordering is required: navigating before tab initialization causes Playwright MCP to create a
separate temporary tab. Later browser tools reuse the initialized tab.

An upstream tool failure is contained to that MCP request and returned as an explicit error result;
it does not tear down the Browser Session's downstream stdio service. Browser Session does not
automatically replay a browser action after a connection failure because the visible action may
already have happened even when its response was lost. The agent must re-observe the live page
before deciding whether a retry is safe.

The process owns one top-level shajara scope. The upstream Playwright client is a scoped resource,
and MCP tool handlers enter that same scope, so cancellation and shutdown converge through one
structured-concurrency tree. Browser Session keeps its application workflow in `RiteCoroutine`
routines; Promise interop is confined to MCP SDK, HTTP, and process-entry boundaries through
`until(...)`.

## Platform access observations

The gateway adds `browser_observe_platform_access`. It evaluates the current page once and, when
visible evidence is definite, appends an `authenticated`, `unauthenticated`, verification, or
access-denial observation to Workspace Service. The page read does not navigate, refresh, or modify
the browser, but the tool itself is not read-only because it writes that durable observation.

Workflows may invoke the tool automatically after meaningful state changes and may use bounded,
paced navigation, retries, or necessary refreshes around it. They must avoid tight polling loops
and repeated visible page churn. An observation does not read cookie values or infer an
interruption from a route name alone.

## User handoff

When a page requires login, verification, or credentials—or when the next action would submit an
application, send a message, or change account state—the agent stops browser input and the user
takes over the same visible tab. Browser Session remains connected during the handoff. The agent
resumes input only after the user explicitly returns control.

## Development

```sh
pnpm --filter @job-boardwalk/browser-session lint
pnpm --filter @job-boardwalk/browser-session typecheck
pnpm --filter @job-boardwalk/browser-session test
pnpm --filter @job-boardwalk/browser-session build
```
