# Browser Session

Browser Session is Job Boardwalk's host-side browser execution plane. It directly owns a Playwright
`BrowserContext`, launches a visible browser, and keeps a dedicated persistent profile for
user-agent collaboration. The Playwright MCP connection is an agent-facing adapter over that same
context; Playwright and Playwright MCP are related, but they are not the same responsibility.

It must run in an environment that can open windows in the user's graphical session. A small
observer reports timestamped platform-access evidence to the Workspace Service. It never sends
cookies, credentials, or browser storage. The agent coordinates its browser tools with the
Workspace Service's domain tools.

## Browser and storage

The default browser channel is `msedge`. Set `JOB_BOARDWALK_BROWSER_CHANNEL` to another Playwright
Chromium channel when required. Browser data and artifacts live below
`.job-boardwalk/browser-session/` by default and follow `JOB_BOARDWALK_HOME` when configured.

The profile is dedicated to Job Boardwalk. The service does not attach to the user's ordinary
browser profile or require a browser extension.

The Workspace Service defaults to `http://127.0.0.1:54310`. Set
`JOB_BOARDWALK_WORKSPACE_SERVICE_URL` when it is reachable at another address. Cookie presence is
reported only as `authentication-unverified`; only platform-specific page evidence may report
`authenticated`.

## Concurrency model

One long-lived shajara scope owns browser creation, the platform-access observer, MCP transport,
and shutdown. The observer uses cancelable `sleep` and structured `all`/`wait` coordination.
Promise-based platform APIs enter routines only through `until(...)`.

## Development

Run the stdio MCP service from an agent host in the graphical environment:

```sh
pnpm --filter @job-boardwalk/browser-session dev
```

For a production-style local build:

```sh
pnpm --filter @job-boardwalk/browser-session build
pnpm --filter @job-boardwalk/browser-session start
```

An agent host should launch this command as a stdio MCP server. If the agent itself runs in a
container without access to the graphical session, a separately authenticated host transport is
required; exposing an unauthenticated browser-control endpoint is not supported.
