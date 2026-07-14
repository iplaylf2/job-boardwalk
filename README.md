# Job Boardwalk

Job Boardwalk is a local AI job-search secretary for delegated research. It helps an agent search
recruiting platforms, preserve findings, revisit sources, and compare opportunities with the
user's confirmed goals.

Read-only research may continue unattended within the scope set by the user. Login, verification,
account changes, applications, and communication always remain under user control.

## System map

Job Boardwalk separates the browser that produces live evidence from the workspace that preserves
durable facts:

- [Browser Session](apps/browser-session/) supervises the MCP connection to the visible browser
  supplied by the graphical host and exposes its tools to the agent over stdio.
- [Workspace Service](apps/workspace-service/) owns local persistence and exposes recruiting-domain
  operations over HTTP and MCP.
- [Dashboard](apps/dashboard/) reads the durable workspace; it does not control the browser or
  claim that a previous observation is live state.

The Browser Session may send timestamped access observations to the Workspace Service, but never
credentials, cookies, or browser profile contents. See [Product design](docs/product-design.md) for
the authoritative collaboration model, ownership boundaries, and current capability boundary.

## Current scope

The Workspace Service currently stores platform-access observations, including access
interruptions, plus profile facts and target locations. Research runs, run-level interruptions,
job results, and analysis are product direction, not yet current capabilities.

## Run locally

Requirements are Node.js 26.5 or later and pnpm 11.11 or later.

Install dependencies and validate the workspace:

```sh
pnpm install
pnpm check
```

### Local configuration

The root `.env.example` lists the supported environment variables. Its ignored `.env` counterpart
is an optional local source of values; project scripts do not load it automatically. Supply values
through the shell or agent host according to the environment in which each process runs.

Keep `PLAYWRIGHT_MCP_EXTENSION_TOKEN` in the graphical host's Playwright MCP process. It is not a
Job Boardwalk variable and must not be stored in the project `.env`.

### Workspace and Dashboard

Start the Workspace Service and Dashboard in separate terminals:

```sh
pnpm --filter @job-boardwalk/workspace-service dev
pnpm --filter @job-boardwalk/dashboard dev
```

Open <http://127.0.0.1:54311>. The Workspace Service MCP endpoint is
<http://127.0.0.1:54310/mcp>.

### Browser and Browser Session

When browser research is needed, install the official Playwright Extension in Chrome or Edge on the
graphical host and run Playwright MCP there with `--extension`, `--port`, and
`--shared-browser-context`.

Browser Session is a stdio MCP server launched by the agent host, not a second service to keep
running in another terminal. The agent host owns that child process and makes its browser tools
available to the agent. Configure `JOB_BOARDWALK_PLAYWRIGHT_MCP_URL` with the graphical host's
reachable `/mcp` endpoint.

Follow the [Browser Session setup](apps/browser-session/README.md#required-upstream-service) and
[registration instructions](apps/browser-session/README.md#register-browser-session) for the exact
commands, networking boundary, restart behavior, and connection lifecycle. Agent-host and
graphical-host configuration remains local and is not part of the product contract.

During research, the agent pauses browser input whenever login, verification, or another
user-controlled action is required, then resumes only after the user explicitly returns control.

Each application's README documents its own configuration and operation.

## Repository map

- [`apps/`](apps/) contains the three product applications.
- [`docs/`](docs/) owns cross-application product design.
- [`packages/`](packages/) contains shared product contracts and the recruiting-platform catalog.
- [`internal/`](internal/) contains private monorepo tooling.
