# Job Boardwalk

[![zread](https://img.shields.io/badge/Ask_Zread-_.svg?style=flat&color=00b0aa&labelColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQuOTYxNTYgMS42MDAxSDIuMjQxNTZDMS44ODgxIDEuNjAwMSAxLjYwMTU2IDEuODg2NjQgMS42MDE1NiAyLjI0MDFWNC45NjAxQzEuNjAxNTYgNS4zMTM1NiAxLjg4ODEgNS42MDAxIDIuMjQxNTYgNS42MDAxSDQuOTYxNTZDNS4zMTUwMiA1LjYwMDEgNS42MDE1NiA1LjMxMzU2IDUuNjAxNTYgNC45NjAxVjIuMjQwMUM1LjYwMTU2IDEuODg2NjQgNS4zMTUwMiAxLjYwMDEgNC45NjE1NiAxLjYwMDFaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00Ljk2MTU2IDEwLjM5OTlIMi4yNDE1NkMxLjg4ODEgMTAuMzk5OSAxLjYwMTU2IDEwLjY4NjQgMS42MDE1NiAxMS4wMzk5VjEzLjc1OTlDMS42MDE1NiAxNC4xMTM0IDEuODg4MSAxNC4zOTk5IDIuMjQxNTYgMTQuMzk5OUg0Ljk2MTU2QzUuMzE1MDIgMTQuMzk5OSA1LjYwMTU2IDE0LjExMzQgNS42MDE1NiAxMy43NTk5VjExLjAzOTlDNS42MDE1NiAxMC42ODY0IDUuMzE1MDIgMTAuMzk5OSA0Ljk2MTU2IDEwLjM5OTlaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik0xMy43NTg0IDEuNjAwMUgxMS4wMzg0QzEwLjY4NSAxLjYwMDEgMTAuMzk4NCAxLjg4NjY0IDEwLjM5ODQgMi4yNDAxVjQuOTYwMUMxMC4zOTg0IDUuMzEzNTYgMTAuNjg1IDUuNjAwMSAxMS4wMzg0IDUuNjAwMUgxMy43NTg0QzE0LjExMTkgNS42MDAxIDE0LjM5ODQgNS4zMTM1NiAxNC4zOTg0IDQuOTYwMVYyLjI0MDFDMTQuMzk4NCAxLjg4NjY0IDE0LjExMTkgMS42MDAxIDEzLjc1ODQgMS42MDAxWiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNCAxMkwxMiA0TDQgMTJaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00IDEyTDEyIDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K&logoColor=ffffff)](https://zread.ai/iplaylf2/job-boardwalk)

Job Boardwalk is a local AI job-search secretary for delegated research. It gives an agent a
visible browser for recruiting-platform research and a durable workspace for preserving findings,
revisiting sources, and comparing opportunities with the user's confirmed goals.

Read-only research may continue unattended within the scope set by the user. Login, verification,
account changes, applications, and communication always remain under user control.

## Current scope

Job Boardwalk supports BOSS直聘, 鱼泡直聘, and 前程无忧51job. It provides browser tools,
collects job and platform-access observations, stores personal context and Markdown reports, and
presents the saved workspace in Dashboard. The agent interprets evidence and authors findings.

Browser adapters cover specific page layouts and evidence rules. See
[platform coverage](apps/browser-session/README.md#platform-coverage) and
[engagement synchronization](apps/browser-session/README.md#explicit-job-engagement-synchronization)
for supported reads and their limits.

## System map

| Application                                        | Responsibility                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [Browser Session](apps/browser-session/)           | Owns the visible persistent browser and exposes browser tools over local HTTP MCP. Runs in the user's graphical session. |
| [Workspace Service](apps/workspace-service/)       | Owns SQLite persistence and the HTTP/MCP APIs for workspace data.                                                        |
| [Dashboard](apps/dashboard/)                       | Displays and maintains workspace data; independently checks optional Browser Session health.                             |
| [Desktop Manager](apps/desktop-manager/)           | Starts, monitors, and stops the desktop product's service processes.                                                     |
| [Desktop Service Host](apps/desktop-service-host/) | Loads one Node service payload per desktop child process.                                                                |

[Product design](docs/product-design.md) defines cross-application behavior and authority.
Application READMEs own their APIs, operation, and maintenance details.

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
pnpm install --frozen-lockfile
pnpm --filter @job-boardwalk/browser-session exec patchright install chromium
pnpm exec moon run browser-session:dev
```

Browser Session launches a visible browser with a dedicated profile in the operating system's user
data directory and owns it for the service lifetime. Dashboard can check its health directly,
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
