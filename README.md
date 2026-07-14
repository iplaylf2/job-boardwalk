# Job Boardwalk

Job Boardwalk is a local AI job-search secretary for delegated research. It helps an agent search
recruiting platforms, preserve findings, revisit sources, and compare opportunities with the
user's confirmed goals.

Read-only research may continue unattended within the scope set by the user. Login, verification,
account changes, applications, and communication always remain under user control.

## System map

Job Boardwalk separates the browser that produces live evidence from the workspace that preserves
durable facts:

- [Browser Session](apps/browser-session/) is a long-lived local HTTP MCP service that owns the
  Patchright CDP connection and exposes project-owned browser tools to the agent.
- [Workspace Service](apps/workspace-service/) owns local persistence and exposes recruiting-domain
  operations over HTTP and MCP.
- [Dashboard](apps/dashboard/) reads the durable workspace; it does not control the browser or
  claim that a previous observation is live state.

The agent interprets live browser evidence and may submit structured observations to Workspace
Service. Browser Session never interprets recruiting pages or sends credentials, cookies, or
browser profile contents. See [Product design](docs/product-design.md) for the authoritative
collaboration model and ownership boundaries.

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

### Browser and Browser Session

Start a dedicated-profile Chrome or Edge window on the graphical host with remote debugging enabled
and the exact Origin allowlist `--remote-allow-origins=http://localhost`. Browser Session attaches
with Patchright `connectOverCDP`; it never launches or closes the graphical browser. Run Browser
Session as a separate long-lived service and connect the agent host to
<http://127.0.0.1:54312/mcp>.

Follow the [Browser Session instructions](apps/browser-session/README.md#run-browser-session) for
the browser flags, proxy configuration, lifecycle, and security boundary.

During research, the agent pauses browser input whenever login, verification, or another
user-controlled action is required, then resumes only after the user explicitly returns control.
Browser Session exposes project-owned browser primitives; the agent interprets their bounded page
evidence and checks it against what the user sees before treating an action as successful. URL scope
permits research navigation only; it never authorizes login, applications, messages, or account
changes.

Each application's README documents its own configuration and operation.

## Repository map

- [`apps/`](apps/) contains the product applications.
- [`docs/`](docs/) owns cross-application product design.
- [`packages/`](packages/) contains shared product contracts and the recruiting-platform catalog.
- [`internal/`](internal/) contains private monorepo tooling.
