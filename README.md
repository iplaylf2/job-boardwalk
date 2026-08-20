# Job Boardwalk

[![zread](https://img.shields.io/badge/Ask_Zread-_.svg?style=flat&color=00b0aa&labelColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQuOTYxNTYgMS42MDAxSDIuMjQxNTZDMS44ODgxIDEuNjAwMSAxLjYwMTU2IDEuODg2NjQgMS42MDE1NiAyLjI0MDFWNC45NjAxQzEuNjAxNTYgNS4zMTM1NiAxLjg4ODEgNS42MDAxIDIuMjQxNTYgNS42MDAxSDQuOTYxNTZDNS4zMTUwMiA1LjYwMDEgNS42MDE1NiA1LjMxMzU2IDUuNjAxNTYgNC45NjAxVjIuMjQwMUM1LjYwMTU2IDEuODg2NjQgNS4zMTUwMiAxLjYwMDEgNC45NjE1NiAxLjYwMDFaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00Ljk2MTU2IDEwLjM5OTlIMi4yNDE1NkMxLjg4ODEgMTAuMzk5OSAxLjYwMTU2IDEwLjY4NjQgMS42MDE1NiAxMS4wMzk5VjEzLjc1OTlDMS42MDE1NiAxNC4xMTM0IDEuODg4MSAxNC4zOTk5IDIuMjQxNTYgMTQuMzk5OUg0Ljk2MTU2QzUuMzE1MDIgMTQuMzk5OSA1LjYwMTU2IDE0LjExMzQgNS42MDE1NiAxMy43NTk5VjExLjAzOTlDNS42MDE1NiAxMC42ODY0IDUuMzE1MDIgMTAuMzk5OSA0Ljk2MTU2IDEwLjM5OTlaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik0xMy43NTg0IDEuNjAwMUgxMS4wMzg0QzEwLjY4NSAxLjYwMDEgMTAuMzk4NCAxLjg4NjY0IDEwLjM5ODQgMi4yNDAxVjQuOTYwMUMxMC4zOTg0IDUuMzEzNTYgMTAuNjg1IDUuNjAwMSAxMS4wMzg0IDUuNjAwMUgxMy43NTg0QzE0LjExMTkgNS42MDAxIDE0LjM5ODQgNS4zMTM1NiAxNC4zOTg0IDQuOTYwMVYyLjI0MDFDMTQuMzk4NCAxLjg4NjY0IDE0LjExMTkgMS42MDAxIDEzLjc1ODQgMS42MDAxWiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNCAxMkwxMiA0TDQgMTJaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00IDEyTDEyIDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K&logoColor=ffffff)](https://zread.ai/iplaylf2/job-boardwalk)

Job Boardwalk is a local AI job-search secretary for delegated research. It gives an agent a
visible browser for recruiting-platform research and a durable workspace for preserving findings,
revisiting sources, and comparing opportunities with the user's confirmed goals.

Read-only research may continue unattended within the scope set by the user. Login, verification,
account changes, applications, and communication always remain under user control.

## System map

Job Boardwalk assigns browser execution, durable state, web presentation, and native desktop
integration to separate applications:

- [Browser Session](apps/browser-session/) is a long-lived local HTTP MCP service that drives a
  visible persistent Chromium-based browser through Patchright in the user's graphical session
  and exposes project-owned browser tools to the agent. It is a host companion, not a container
  workload.
- [Workspace Service](apps/workspace-service/) owns local persistence and exposes recruiting-domain
  operations over HTTP and MCP from an isolated container. It also tracks leased Browser Session
  presence for readers.
- [Dashboard](apps/dashboard/) presents workspace data and research reports, and lets the user
  maintain personal context and select the job-search intent that guides recruiting research. It
  never controls the browser.
- [Desktop Service Host](apps/desktop-service-host/) is the private, application-specific Node.js
  executable bundled with the desktop product. Each invocation loads one finalized service
  payload and exits when that service ends; it does not coordinate the product topology.
- [Desktop Manager](apps/desktop-manager/) is the native Slint operating-system integration
  and desktop-supervision boundary. It starts, checks, observes, and stops Workspace Service,
  Dashboard's packaged Caddy process, and Browser Session. It selects the desktop browser,
  presents aggregate product status, and never takes over Browser Session's page-control boundary.

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
  bounded, structured snapshot of job cards or the main description on an already-open detail page.
  Explicit description snapshots return only after Workspace Service preserves their observations;
  passive collection submits evidence from eligible tabs that are already open. Neither workflow
  opens or navigates research pages. The selected job-search intent guides explicit agent
  navigation, not background browsing. Platform lists of interested, contacted, applied, and
  interviewed jobs are synchronized for one platform and category at a time, only within a
  user-requested agent task; supported continuations require another explicit call and remain
  bounded to 60 distinct jobs.
- Workspace Service stores platform-access observations and interruptions, along with personal
  context, job-search intents, normalized job facts, platform-observed engagement records for job
  sources, source-specific descriptions, and Markdown research reports. It merges confident
  cross-platform matches while preserving each platform source and its collected evidence.
- Dashboard displays that durable workspace data alongside leased Browser Session presence and
  lets the user maintain and select job-search intents. Its paginated job library supports search,
  platform filtering, a combined view of all tracked jobs, and category views for interested,
  contacted, applied, and interviewed records while preserving the original recruiting-platform
  sources. It reports description coverage and can show jobs with a description, all jobs without
  one, or only missing-description jobs that still lack a stable detail-page source. Its report
  reader keeps saved conclusions available without the agent conversation that produced them.
- Desktop Manager provides working start, stop, and status controls while displaying the Dashboard
  address and service log path and directly supervising the product's isolated service processes.
  Browser discovery or launch failure, or a later Browser Session process exit, puts the
  application in a limited state without taking Workspace Service or Dashboard offline.
- Portable desktop prereleases package Job Boardwalk into one directory for Linux x64 and Windows
  x64. They run without installing Docker or Node.js and without a source checkout, and they use an
  installed Chrome, Edge, or Chromium browser. [Desktop distribution](docs/desktop-distribution.md)
  explains how to use them and why Compose remains the supported deployment.

## Run Job Boardwalk

The supported deployment uses Docker Compose. Unsigned portable desktop builds are also available
for prerelease evaluation.

### Supported Compose deployment

Workspace Service and Dashboard require Docker Engine with Docker Compose; building their images
from source also requires BuildKit. Browser Session requires a graphical host session, Patchright
Chromium, and the Node.js and pnpm toolchain declared in the root
[`package.json`](package.json) and resolved in [`pnpm-lock.yaml`](pnpm-lock.yaml). The
package-manager configuration selects those locked versions, downloading them when needed.

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
pnpm exec moon run browser-session:dev
```

Browser Session launches a visible browser with a dedicated profile in the operating system's user
data directory and owns it for the service lifetime. It reports runtime status to Workspace Service
while the agent host connects to <http://127.0.0.1:54312/mcp>.

### Portable desktop prerelease

[GitHub Releases](https://github.com/iplaylf2/job-boardwalk/releases) provides unsigned Linux x64
and Windows x64 archives for prerelease evaluation. Download the archive for your operating system
and extract the complete `job-boardwalk` directory to a writable location. The desktop build
requires an installed Chrome, Edge, or Chromium browser but does not require installing Docker or
Node.js and does not require a source checkout.

The archive's `readme.md` explains how to start the application and where it stores data. The
prerelease does not provide automatic updates or a supported backup-and-restore workflow, and the
existing Compose deployment remains the supported topology. See
[Desktop distribution](docs/desktop-distribution.md#use-a-desktop-prerelease) for the complete
prerelease limitations. Developers who need to build an archive from source should follow
[Development](docs/development.md#desktop-distribution-staging).

See [Deployment](docs/deployment.md) for runtime lifecycle, persistence, health, logs, backup, and
restore. See [Development](docs/development.md) for the cross-language workspace and checks. The
root `.env.example` is the environment-variable reference; project entrypoints do not load `.env`
automatically.

## Repository checks

Non-draft pull requests targeting `master` run the repository checks automatically. To reproduce
them locally, install the locked Node.js dependencies and the Rust toolchain declared in
[`rust-toolchain.toml`](rust-toolchain.toml). Linux also requires the native build dependencies
listed by [Desktop Manager](apps/desktop-manager/README.md). Then run the root check:

```sh
pnpm install --frozen-lockfile
pnpm exec moon exec --plan .moon/check.json
```

The check plan covers formatting, unused code, dependency boundaries, linting, type checking,
tests, and production builds across the pnpm and Cargo workspaces. To apply formatting, run:

```sh
pnpm exec moon run repository:format-write cargo-workspace:format-write
```

[Development](docs/development.md) documents task ownership, dependency authorities, generated
artifacts, and the CI platform policy.

## Repository map

- [`.moon/`](.moon/workspace.yml) owns the cross-language project graph, reusable task inputs, and
  local and CI execution plans.
- [`apps/`](apps/README.md) contains the product applications.
- [`docs/`](docs/README.md) contains cross-application product, deployment, and development
  documentation.
- [`packages/`](packages/README.md) contains shared product contracts and the recruiting-platform
  catalog.
- [`internal/`](internal/README.md) contains private monorepo tooling.
