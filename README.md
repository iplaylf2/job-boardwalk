# Job Boardwalk

Job Boardwalk is a local AI job-search secretary for delegated research. It helps an agent search
recruiting platforms, preserve findings, revisit sources, and compare opportunities with the
user's confirmed goals.

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
Service. Independently, Browser Session sends bounded runtime status reports to Workspace Service,
which derives leased presence for Dashboard and MCP readers. Browser Session never sends
credentials, cookies, browser storage, or profile contents. See
[Product design](docs/product-design.md) for the authoritative collaboration model and ownership
boundaries.

## Current scope

The Workspace Service currently stores platform-access observations, including access
interruptions, plus profile facts and target locations. Research runs, run-level interruptions,
job observations, and analysis are product direction, not yet current capabilities.

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

During research, the agent pauses browser input for login, verification, applications, messages,
and account changes, then resumes only after the user explicitly returns control. The BOSS HTTPS
navigation scope permits research navigation only; it does not authorize those actions.

Each application's README documents its own configuration and operation.

## Repository map

- [`apps/`](apps/) contains the product applications.
- [`docs/`](docs/) owns cross-application product design.
- [`packages/`](packages/) contains shared product contracts and the recruiting-platform catalog.
- [`internal/`](internal/) contains private monorepo tooling.
