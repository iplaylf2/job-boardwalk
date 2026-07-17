# Workspace Service

Workspace Service owns Job Boardwalk's durable local workspace and workspace read model. It is the
sole owner of SQLite persistence. Its loopback HTTP server exposes `/api` to Dashboard and `/mcp`
to MCP clients; it does not serve Dashboard assets or own a browser process.

The repository's [product design](../../docs/product-design.md) defines the intended delegation and
browser-collaboration model. The current service preserves platform-access observations and exposes
read and write operations for profile facts and target locations. It does not yet expose research
runs, run-level interruptions, job observations, or analysis.

Live web interaction belongs to the separate [`browser-session`](../browser-session/) application,
which owns the visible persistent Patchright browser. The agent coordinates that live browser work
with the durable workspace exposed by this service.

Browser Session also sends status reports directly to Workspace Service. An in-memory presence
tracker renews a short lease for each report and makes the result available to Dashboard and MCP
readers. The same report may carry authentication observations derived from real platform
navigation responses or bounded snapshots; the service validates, deduplicates, and persists them.
An expired lease is shown as offline rather than current browser state.

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
- `DELETE /api/profile/facts/:id`
- `POST /api/search-intent/locations`
- `DELETE /api/search-intent/locations/:id`

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
  },
  "platformAccessObservations": []
}
```

Workspace Service assigns `receivedAt` when it accepts the report. A current lease appears as
`online`; an expired lease appears as `offline`; before the first report, presence is `unknown`.
This presence state remains in memory and resets to `unknown` when Workspace Service restarts.
Platform-access observations carried in the report are durable and are appended only when the
latest state for that platform changes.

### Platform-access observations

Browser Session submits structured platform-access conclusions when an adapter derives an
authentication observation from a qualifying top-level navigation response or bounded page
snapshot. An agent may use the same endpoint only for evidence that no adapter classified:

```json
{
  "platformId": "boss",
  "authenticationState": "authenticated",
  "evidence": "protected-resource",
  "observedAt": "2026-07-13T01:00:00.000Z"
}
```

Observations are append-only. `platformId` accepts the catalog identifiers `boss` and `yupao`.
Authentication evidence distinguishes how the conclusion was established:

- `protected-resource` records `authenticated` from a successful navigation known to require
  authentication;
- `authenticated-page` records `authenticated` after bounded, account-specific page content
  establishes an active session;
- `login-redirect` records `unauthenticated` when a protected navigation redirects to login.

Verification and access denial use the separate `interruption` field. The workspace overview
projects the latest definite authentication result and only an interruption newer than that result.

### Personal context and search intent

Profile facts represent the user's personal context. The endpoint accepts:

```json
{
  "initiatedBy": "user",
  "key": "目标岗位",
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
  "initiatedBy": "user",
  "priority": 1,
  "requirement": "required",
  "reason": "用户将上海设为目标城市的硬性范围"
}
```

Dashboard and agents use the same write boundary. `initiatedBy` records whether a change came from
`user`, `agent`, or `system`. Individual facts and locations can be removed with
`DELETE /api/profile/facts/:id` and `DELETE /api/search-intent/locations/:id`; both accept a JSON
body containing `initiatedBy` and `reason`.

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
