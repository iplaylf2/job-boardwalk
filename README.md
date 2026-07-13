# job-boardwalk

Job Boardwalk is a local AI job-search secretary. A user can delegate open-ended job research to
the agent: searching recruiting platforms, collecting and revisiting listings, organizing results
across sources, and analyzing their fit with the user's goals. Read-only research may continue
unattended within the scope the user has set.

## Collaboration model

The agent owns delegated research and analysis. The user retains control of login and verification,
account changes, applications, and communication with other people. The target collaboration model
uses a visible, persistent browser so control can move between the user and the agent without
discarding the authenticated session.

See [product design](docs/product-design.md) for the authoritative delegation model, browser
lifecycle, automation principles, and current capability boundary.

## How collaboration works

Job Boardwalk is organized around two visible surfaces alongside the AI agent's own interface:

- A managed Chromium window is the intended shared research surface for the user and the agent.
- A SolidJS dashboard presents durable local information such as platform access, confirmed profile
  facts, and target locations.

The local runtime owns the shared state behind both surfaces. One loopback HTTP server exposes
`/api` to the dashboard and `/mcp` to MCP clients; those clients never access SQLite or Chromium
profiles directly.

The current runtime can read workspace state, report browser availability, and open a visible
platform browser. Agent-controlled research and durable job results are the next capabilities
described by the product design.

## Repository map

- [`apps/`](apps/) contains the dashboard and local runtime.
- [`docs/`](docs/) owns product design and cross-application guidance.
- [`packages/`](packages/) contains shared product contracts and local storage conventions.
- [`internal/`](internal/) contains private monorepo tooling.

## Development

Install dependencies and validate the workspace:

```sh
pnpm install
pnpm check
```

Start the runtime and dashboard in separate terminals:

```sh
pnpm --filter @job-boardwalk/runtime dev
pnpm --filter @job-boardwalk/dashboard dev
```

Open <http://127.0.0.1:54311>. Connect an MCP host to the runtime's Streamable HTTP endpoint at
<http://127.0.0.1:54310/mcp>.

See [dashboard operation](apps/dashboard/) and [runtime operation](apps/runtime/) for application
details.
