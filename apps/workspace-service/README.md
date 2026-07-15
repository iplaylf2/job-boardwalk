# Workspace Service

Workspace Service owns Job Boardwalk's durable local workspace and workspace read model. It is the
sole owner of SQLite persistence. Its loopback HTTP server exposes `/api` to Dashboard and `/mcp`
to MCP clients; it does not serve Dashboard assets or own a browser process.

The repository's [product design](../../docs/product-design.md) defines the intended delegation and
browser-collaboration model. The current service preserves platform-access observations and reads
or updates profile facts and target locations. It does not yet expose research runs, run-level
interruptions, job observations, or analysis.

Live web interaction belongs to the separate [`browser-session`](../browser-session/) application,
which owns the visible persistent Patchright browser. The agent coordinates that live browser work
with the durable workspace exposed by this service.

Browser Session also sends runtime status reports directly to Workspace Service. An in-memory
presence tracker renews a short lease for each report and makes the result available to Dashboard
and MCP readers. It is separate from agent-interpreted durable platform-access observations. An
expired lease is shown as offline rather than current browser state.

## Run Workspace Service

For development:

```sh
pnpm --filter @job-boardwalk/workspace-service dev
```

The Workspace Service listens on <http://127.0.0.1:54310>.

For a production-style run:

```sh
pnpm --filter @job-boardwalk/workspace-service build
pnpm --filter @job-boardwalk/workspace-service start
```

## Connect an MCP host

Configure the MCP host to use the Streamable HTTP endpoint at
<http://127.0.0.1:54310/mcp>. MCP requests share the service process, workspace repository, and
top-level shajara scope with the HTTP API.

The MCP surface provides:

- `job-boardwalk://workspace/overview`, a resource containing Browser Session presence,
  platform-access summaries, profile facts, and target locations;
- `read_workspace_overview`, which reads the same workspace state.

## HTTP API

The loopback HTTP surface currently exposes:

- `GET /api/workspace/overview`
- `PUT /api/browser-session/status`
- `POST /api/platform-access/observations`
- `POST /api/profile/facts`
- `POST /api/search-intent/locations`

Shared request and response types live in
[`@job-boardwalk/contracts`](../../packages/contracts/).

### Browser Session status

Browser Session renews its presence lease with a bounded status report:

```json
{
  "browserStatus": {
    "available": true,
    "browserVersion": "150.0.0.0",
    "tabCount": 1
  }
}
```

Workspace Service assigns `receivedAt` when it accepts the report. A current lease appears as
`online`; an expired lease appears as `offline`; before the first report, presence is `unknown`.
This state remains in memory, resets to `unknown` when Workspace Service restarts, and is not a
platform-authentication observation.

### Platform-access observations

After interpreting current browser evidence, an agent may submit a structured platform-access
conclusion. Browser Session does not interpret or create this observation:

```json
{
  "platformId": "boss",
  "authenticationState": "authenticated",
  "evidence": "account-identity",
  "observedAt": "2026-07-13T01:00:00.000Z"
}
```

Observations are append-only. Authentication is recorded as `authenticated` or `unauthenticated`;
verification and access denial use the separate `interruption` field. The workspace overview
projects the latest definite authentication result and only an interruption newer than that result.
`platformId` accepts the catalog identifiers `boss` and `yupao`.

### Profile and search intent

The profile-fact endpoint accepts:

```json
{
  "key": "target-role",
  "value": "后端工程师",
  "source": "user",
  "confirmed": true,
  "reason": "用户明确说明目标岗位"
}
```

The target-location endpoint accepts:

```json
{
  "city": "上海",
  "priority": 1,
  "requirement": "required",
  "reason": "用户将上海设为首选城市"
}
```

## Persistence

The SQLite database lives under the operating system's user data directory by default. Set
`JOB_BOARDWALK_WORKSPACE_DATABASE_PATH` to choose the exact database path. Relative values resolve
from the current working directory. Workspace Service neither knows nor shares Browser Session's
profile location.

The Drizzle schema lives in `src/persistence/schema.ts`. The `migrations/` directory contains
exactly one complete baseline for the current model, not an upgrade chain. Existing databases from
earlier exploratory models are unsupported and must be deleted before starting this version.

During exploration, a schema change replaces both the database and the baseline. Remove the local
database and current migration directory, then generate one new baseline from the complete schema.
Do not add transitional or compatibility SQL.

```sh
pnpm --filter @job-boardwalk/workspace-service db:generate
```

## Local security boundary

Workspace Service binds only to `127.0.0.1`. Non-GET API and MCP requests carrying a non-local
browser origin are rejected. The service has no access to authentication cookies or browser profile
contents. Origin filtering is not authentication; local processes are inside the service trust
boundary. Local state is created with owner-only permissions on systems that support POSIX modes.

## Concurrency model

The process owns one top-level shajara scope. HTTP and MCP work converge through that scope. Service
workflows use `RiteCoroutine`; Promise-returning transport APIs enter routines only through
`until(...)`. The root routine owns the HTTP server, shutdown signal, active request scope, and
repository cleanup. During shutdown, the service stops accepting requests, waits for the server to
drain, and closes SQLite as the scope converges.

## Development

Run the service checks with:

```sh
pnpm --filter @job-boardwalk/workspace-service lint
pnpm --filter @job-boardwalk/workspace-service typecheck
pnpm --filter @job-boardwalk/workspace-service test
pnpm --filter @job-boardwalk/workspace-service build
```
