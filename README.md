# job-boardwalk

Job Boardwalk explores how a user-directed agent can assist with recruiting-site work across
platforms that expose similar information and actions through different interaction models.

## Product boundary

The agent acts as a recruiting assistant under the user's goals and delegated authority. It may
continue routine work without the user watching every step. This differs from concurrent bulk
crawling: the project favors ordinary, low-concurrency browsing, respects applicable rate limits
and terms, and does not aim to bypass access controls or platform restrictions.

Shared concepts and platform-specific behavior are derived from working integrations. The model
will continue to evolve as browsing and collaboration capabilities are implemented.

## Current status

The repository is a pnpm-managed TypeScript monorepo. Its browser application establishes and
reuses Chromium profiles for BOSS直聘 and 鱼泡直聘. A local state service maintains the latest
platform authentication state, profile facts, and target locations. A separate SolidJS dashboard
presents that workspace state. Agent-assisted browsing beyond login remains under development.

## Workspace map

- [`apps/`](apps/) contains runnable applications and their operating documentation.
- [`internal/`](internal/) contains private development support for this repository.
- [`packages/`](packages/) contains reusable product contracts and filesystem conventions shared by
  multiple applications.

## Development

```sh
pnpm install
pnpm check
```

`pnpm check` runs formatting, unused-code analysis, dependency validation, linting, type checks,
tests, and builds across the workspaces that provide them.

To use the local dashboard, start the state service and dashboard in separate terminals:

```sh
pnpm --filter @job-boardwalk/state-service dev
pnpm --filter @job-boardwalk/dashboard dev
```

Then open <http://127.0.0.1:4311>. See the application documentation for
[browser login and profile reuse](apps/browser/), [dashboard operation](apps/dashboard/), and the
[state API](apps/state-service/).
