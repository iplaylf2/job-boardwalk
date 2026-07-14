# Browser Session

Browser Session is Job Boardwalk's MCP gateway to a user-visible browser. It does not launch a
browser or own a browser profile. Instead, it keeps one Streamable HTTP client connected to a
Playwright MCP server running beside Chrome or Edge on the graphical host, then exposes the
upstream browser tools over stdio to any MCP-capable agent host.

The graphical host owns the official Playwright Extension, browser process, profile, cookies, and
visible tabs. Browser Session owns the persistent upstream connection, handoff protocol between
the user and agent, tool-result redaction, and explicit platform-access observations.

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

## Run Browser Session

Supply the upstream MCP endpoint and run the stdio service:

```sh
JOB_BOARDWALK_PLAYWRIGHT_MCP_URL=http://127.0.0.1:8931/mcp \
  pnpm --filter @job-boardwalk/browser-session mcp
```

Set `JOB_BOARDWALK_WORKSPACE_SERVICE_URL` only when Workspace Service is not available at its
default `http://127.0.0.1:54310` address. The root
[`.env.example`](../../.env.example) documents the supported variables. Project scripts do not
load `.env`; supply variables through the shell or Agent Host. Agent Host MCP registration remains
separate local configuration.

Browser Session establishes exactly one upstream client for its process lifetime. Immediately
after connecting, it calls `browser_tabs(list)` once to bind Playwright's current page to the tab
selected by the extension. This ordering is required: navigating before tab initialization causes
Playwright MCP to create a separate temporary tab. Later browser tools reuse the initialized tab.

The process owns one top-level shajara scope. The upstream Playwright client is a scoped resource,
and MCP tool handlers enter that same scope, so cancellation and shutdown converge through one
structured-concurrency tree. Browser Session keeps its application workflow in `RiteCoroutine`
routines; Promise interop is confined to MCP SDK, HTTP, and process-entry boundaries through
`until(...)`.

## Access observations and handoff

The gateway adds `browser_observe_platform_access`. This explicit read-only tool evaluates the
current page once, records a definite `authenticated` or `unauthenticated` observation when visible
evidence supports it, and reports a semantic verification or access-denial interruption when one is
actually present. A single invocation does not navigate or refresh. Workflows may invoke it
automatically after meaningful state changes and may use bounded, paced navigation, retries, or
necessary refreshes around it. They must avoid tight polling loops and repeated visible page churn.
The observation does not read cookie values or infer an interruption from a route name alone.

When login, verification, credentials, applications, messages, or account changes appear, the
agent stops browser input and the user takes over the same visible tab. Browser Session remains
connected during the handoff and resumes only after the user explicitly returns control.

## Development

```sh
pnpm --filter @job-boardwalk/browser-session lint
pnpm --filter @job-boardwalk/browser-session typecheck
pnpm --filter @job-boardwalk/browser-session test
pnpm --filter @job-boardwalk/browser-session build
```
