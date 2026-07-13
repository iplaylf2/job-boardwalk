# job-boardwalk

Job Boardwalk explores how an AI agent can help a user research recruiting platforms while the
user remains responsible for every action that affects an account or another person.

## Product boundary

The agent may navigate recruiting sites, collect job information, combine results across
platforms, and analyze their fit with the user's goals. The user personally handles:

- login, verification, and other platform security checks;
- applications, messages, and interview responses;
- profile, résumé, favorites, follows, and other account changes.

Job Boardwalk does not expose agent tools for those user-only actions. Browsing remains ordinary
and low-concurrency, respects applicable rate limits and terms, and does not attempt to bypass
access controls or platform restrictions.

## How collaboration works

Job Boardwalk has two visible surfaces alongside the AI agent's own interface:

- A managed Chromium window lets the agent navigate recruiting sites and lets the user take over
  for login, verification, or any action reserved for the user.
- A SolidJS dashboard presents durable local information such as platform access, confirmed profile
  facts, and target locations.

The local runtime owns both surfaces' shared state. It exposes an MCP server to the agent and a
loopback HTTP API to the dashboard. The dashboard and MCP server never access SQLite or Chromium
profiles directly.

## Repository map

- [`apps/`](apps/) contains the dashboard and local runtime.
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

Open <http://127.0.0.1:4311>. To connect an MCP host, run the stdio adapter as a third process:

```sh
pnpm --filter @job-boardwalk/runtime mcp
```

See [dashboard operation](apps/dashboard/) and [runtime operation](apps/runtime/) for application
details.
