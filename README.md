# Job Boardwalk

Job Boardwalk is a local AI job-search secretary for delegated research. It gives an agent a
visible browser for recruiting-platform research and a durable workspace for preserving findings,
revisiting sources, and comparing opportunities with the user's confirmed goals.

Read-only research may continue unattended within the scope set by the user. Login, verification,
account changes, applications, and communication always remain under user control.

## System map

Job Boardwalk separates the browser that produces live evidence from the workspace that preserves
durable facts:

- [Browser Session](apps/browser-session/) is a long-lived local HTTP MCP service that owns a
  visible persistent Patchright browser and exposes project-owned browser tools to the agent.
- [Workspace Service](apps/workspace-service/) owns local persistence and exposes recruiting-domain
  operations over HTTP and MCP. It also tracks leased Browser Session presence for readers.
- [Dashboard](apps/dashboard/) reads the workspace overview, including durable observations and
  leased Browser Session presence. It never controls the browser.

The agent interprets live browser evidence and may submit structured observations to Workspace
Service. When a platform adapter has a conclusive response rule, Browser Session can separately
derive an authentication observation from a qualifying top-level navigation and report it to
Workspace Service. Workspace Service derives leased presence and deduplicates durable observations
for Dashboard and MCP readers. See [Product design](docs/product-design.md) for the authoritative
collaboration model and ownership boundaries.

## Current scope

Available now:

- Browser Session supports BOSS直聘 and 鱼泡直聘 through one shared recruiting-platform workflow,
  with platform-specific navigation and access-assessment rules behind adapters.
- Workspace Service stores platform-access observations and interruptions, profile facts, and
  target locations.
- Dashboard displays that durable workspace data alongside leased Browser Session presence.

Research runs, run-level interruptions, job observations, and analysis remain product direction;
they are not yet exposed by the applications.

## Run locally

Requirements are Node.js 26.5 or later and pnpm 11.13 or later. pnpm automatically downloads the
project's pinned Node.js runtime for workspace scripts when the host runtime does not match.

Install dependencies and validate the workspace:

```sh
pnpm install
pnpm check
```

### Local configuration

The root `.env.example` lists the supported environment variables. Its ignored `.env` counterpart
is an optional local source of values; project scripts do not load it automatically. Supply values
through the shell or agent host according to the environment in which each process runs.

### Workspace and Dashboard

Start the Workspace Service and Dashboard in separate terminals:

```sh
pnpm --filter @job-boardwalk/workspace-service dev
pnpm --filter @job-boardwalk/dashboard dev
```

Open <http://127.0.0.1:54311>. The Workspace Service MCP endpoint is
<http://127.0.0.1:54310/mcp>.

### Browser Session

Install Patchright's Chromium once, then start Browser Session in a graphical desktop session:

```sh
pnpm --filter @job-boardwalk/browser-session exec patchright install chromium
pnpm --filter @job-boardwalk/browser-session dev
```

Browser Session launches a visible browser with a dedicated profile in the operating system's user
data directory and owns it for the service lifetime. It reports runtime status to Workspace Service
while the agent host connects to <http://127.0.0.1:54312/mcp>.

When the user requests login, or visible page evidence shows that the requested workflow requires
authentication and the current session is unauthenticated, the agent proactively opens the
platform login interface. The agent then pauses browser input so the user can enter credentials and
complete verification. Applications, messages, and account changes likewise remain under user
control, and the agent resumes only after the user explicitly returns control. A supported
platform's HTTPS navigation scope permits research and login-handoff preparation only; it does not
authorize those user actions.

Each application's README documents its own configuration and operation.

## Repository map

- [`apps/`](apps/README.md) contains the product applications.
- [`docs/`](docs/product-design.md) owns cross-application product design.
- [`packages/`](packages/README.md) contains shared product contracts and the recruiting-platform
  catalog.
- [`internal/`](internal/README.md) contains private monorepo tooling.
