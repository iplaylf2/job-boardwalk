# Job Boardwalk

Job Boardwalk is a local AI job-search secretary for delegated research. It helps an agent search
recruiting platforms, preserve findings, revisit sources, and compare opportunities with the
user's confirmed goals.

Read-only research may continue unattended within the scope set by the user. Login, verification,
account changes, applications, and communication always remain under user control.

## System map

Job Boardwalk separates the browser that produces live evidence from the workspace that preserves
durable facts:

- [Browser Session](apps/browser-session/) owns the visible, persistent Playwright browser shared
  by the user and agent.
- [Workspace Service](apps/workspace-service/) owns local persistence and exposes recruiting-domain
  operations over HTTP and MCP.
- [Dashboard](apps/dashboard/) reads the durable workspace; it does not control the browser or
  claim that a previous observation is live state.

The Browser Session may send timestamped access observations to the Workspace Service, but never
credentials, cookies, or browser profile contents. See [Product design](docs/product-design.md) for
the authoritative collaboration model, ownership boundaries, and current capability boundary.

## Current scope

The Workspace Service currently stores platform-access observations, profile facts, and target
locations. Research runs, interruptions, job results, and analysis are product direction, not yet
current capabilities.

## Run locally

Requirements are Node.js 26.5 or later and pnpm 11.11 or later.

Install dependencies and validate the workspace:

```sh
pnpm install
pnpm check
```

Start the Workspace Service and Dashboard in separate terminals:

```sh
pnpm --filter @job-boardwalk/workspace-service dev
pnpm --filter @job-boardwalk/dashboard dev
```

Open <http://127.0.0.1:54311>. The Workspace Service MCP endpoint is
<http://127.0.0.1:54310/mcp>.

When browser research is needed, an agent host in the graphical environment starts Browser Session
as a stdio MCP server:

```sh
pnpm --filter @job-boardwalk/browser-session dev
```

Each application's README documents its own configuration and operation.

## Repository map

- [`apps/`](apps/) contains the three product applications.
- [`docs/`](docs/) owns cross-application product design.
- [`packages/`](packages/) contains shared product contracts and storage conventions.
- [`internal/`](internal/) contains private monorepo tooling.
