# Job Boardwalk

[![zread](https://img.shields.io/badge/Ask_Zread-_.svg?style=flat&color=00b0aa&labelColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQuOTYxNTYgMS42MDAxSDIuMjQxNTZDMS44ODgxIDEuNjAwMSAxLjYwMTU2IDEuODg2NjQgMS42MDE1NiAyLjI0MDFWNC45NjAxQzEuNjAxNTYgNS4zMTM1NiAxLjg4ODEgNS42MDAxIDIuMjQxNTYgNS42MDAxSDQuOTYxNTZDNS4zMTUwMiA1LjYwMDEgNS42MDE1NiA1LjMxMzU2IDUuNjAxNTYgNC45NjAxVjIuMjQwMUM1LjYwMTU2IDEuODg2NjQgNS4zMTUwMiAxLjYwMDEgNC45NjE1NiAxLjYwMDFaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00Ljk2MTU2IDEwLjM5OTlIMi4yNDE1NkMxLjg4ODEgMTAuMzk5OSAxLjYwMTU2IDEwLjY4NjQgMS42MDE1NiAxMS4wMzk5VjEzLjc1OTlDMS42MDE1NiAxNC4xMTM0IDEuODg4MSAxNC4zOTk5IDIuMjQxNTYgMTQuMzk5OUg0Ljk2MTU2QzUuMzE1MDIgMTQuMzk5OSA1LjYwMTU2IDE0LjExMzQgNS42MDE1NiAxMy43NTk5VjExLjAzOTlDNS42MDE1NiAxMC42ODY0IDUuMzE1MDIgMTAuMzk5OSA0Ljk2MTU2IDEwLjM5OTlaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik0xMy43NTg0IDEuNjAwMUgxMS4wMzg0QzEwLjY4NSAxLjYwMDEgMTAuMzk4NCAxLjg4NjY0IDEwLjM5ODQgMi4yNDAxVjQuOTYwMUMxMC4zOTg0IDUuMzEzNTYgMTAuNjg1IDUuNjAwMSAxMS4wMzg0IDUuNjAwMUgxMy43NTg0QzE0LjExMTkgNS42MDAxIDE0LjM5ODQgNS4zMTM1NiAxNC4zOTg0IDQuOTYwMVYyLjI0MDFDMTQuMzk4NCAxLjg4NjY0IDE0LjExMTkgMS42MDAxIDEzLjc1ODQgMS42MDAxWiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNCAxMkwxMiA0TDQgMTJaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00IDEyTDEyIDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K&logoColor=ffffff)](https://zread.ai/iplaylf2/job-boardwalk)

Job Boardwalk is a local AI job-search secretary for delegated research. It gives an agent a
visible browser for recruiting-platform research and a durable workspace for preserving findings,
revisiting sources, and comparing opportunities with the user's confirmed goals.

Read-only research may continue unattended within the scope set by the user. Login, verification,
account changes, applications, and communication always remain under user control.

## System map

Job Boardwalk separates the browser that produces live evidence from the workspace that preserves
durable facts:

- [Browser Session](apps/browser-session/) is a long-lived local HTTP MCP service that owns a
  visible persistent Patchright browser in the user's graphical session and exposes project-owned
  browser tools to the agent. It is a host companion, not a container workload.
- [Workspace Service](apps/workspace-service/) owns local persistence and exposes recruiting-domain
  operations over HTTP and MCP from an isolated container. It also tracks leased Browser Session
  presence for readers.
- [Dashboard](apps/dashboard/) presents workspace data and research reports, and lets the user
  maintain personal context and select the job-search intent that guides recruiting research. Its
  container serves the production client and proxies its same-origin API requests; it never
  controls the browser.

Browser Session adapters derive structured authentication observations from qualifying top-level
navigations and bounded snapshots when they have conclusive platform rules. The agent interprets
evidence outside those rules and coordinates user handoff. Workspace Service derives leased
presence and deduplicates durable observations for Dashboard and MCP readers. See
[Product design](docs/product-design.md) for the authoritative collaboration model and ownership
boundaries.

## Current scope

Available now:

- Browser Session supports BOSS直聘 and 鱼泡直聘 through one shared recruiting-platform workflow,
  with platform-specific navigation and access-assessment rules behind adapters. It can also take a
  bounded, structured snapshot of job cards already loaded on an eligible supported-platform page.
  A passive collector submits recognizable cards from eligible platform tabs that are already open;
  it never opens or navigates a recommendation page. The selected job-search intent supplies
  research context for explicit agent navigation, not a background browsing schedule. Interested,
  contacted, applied, and interviewed lists are synchronized one platform, category, and page at a
  time only within a user-requested agent task. Browser Session does not rotate those lists or use
  personal-center navigation to keep a session active.
- Workspace Service stores platform-access observations and interruptions, along with personal
  context, job-search intents, normalized job facts, platform-observed engagement records for job
  sources, and Markdown research reports. It skips unchanged observations and merges confident
  cross-platform matches while preserving every available platform link.
- Dashboard displays that durable workspace data alongside leased Browser Session presence and
  lets the user maintain and select job-search intents. Its paginated job library supports search,
  platform filtering, and in-library views for interested, contacted, applied, and interviewed
  records while preserving the original recruiting-platform sources. Its report reader keeps saved
  conclusions available without the agent conversation that produced them.

Durable research runs and run-level progress remain product direction; they are not yet exposed by
the applications.

## Run Job Boardwalk

Workspace Service and Dashboard require Docker Engine with Docker Compose; building their images
from source also requires BuildKit. Browser Session requires a graphical host session, Node.js 26.5
or later, and pnpm 11.13 or later. The project's pnpm configuration downloads its pinned Node.js
runtime when the host runtime does not match.

Build and start the container-owned services:

```sh
docker compose -f compose.yaml -f deploy/compose.build.yaml up --build --detach
```

Open <http://127.0.0.1:54311>. Workspace Service remains reachable from the host and the agent at
<http://127.0.0.1:54310/mcp>; neither service is published on a non-loopback interface.

Install dependencies and Patchright's Chromium on the graphical host, then start Browser Session:

```sh
pnpm install
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

See [Deployment](docs/deployment.md) for lifecycle, persistence, health, logs, backup, and the
development workflow. The root `.env.example` is the environment-variable reference; project
entrypoints do not load `.env` automatically.

## Repository checks

Non-draft pull requests targeting `master` run the repository checks automatically. To reproduce
them locally, install the locked dependencies and run the root check:

```sh
pnpm install --frozen-lockfile
pnpm check
```

The root check covers formatting, unused code, dependency boundaries, linting, type checking,
tests, and production builds.

## Repository map

- [`apps/`](apps/README.md) contains the product applications.
- [`docs/`](docs/product-design.md) owns cross-application product design.
- [`packages/`](packages/README.md) contains shared product contracts and the recruiting-platform
  catalog.
- [`internal/`](internal/README.md) contains private monorepo tooling.
