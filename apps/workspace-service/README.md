# Workspace Service

Workspace Service owns Job Boardwalk's durable local workspace and workspace read model. It is the
sole owner of SQLite persistence. Its loopback HTTP server exposes `/api` to Dashboard and `/mcp`
to MCP clients; it does not serve Dashboard assets or own a browser process.

The repository's [product design](../../docs/product-design.md) defines the intended delegation and
browser-collaboration model. The current service preserves platform-access observations and exposes
read and write operations for profile facts, job-search intents, normalized jobs, and their
platform sources. Each intent owns a target position, city, selection state, and per-platform
recommendation-page references. It does not store recruiting pages or historical page
snapshots.

Live web interaction belongs to the separate [`browser-session`](../browser-session/) application,
which owns the visible persistent Patchright browser. The agent coordinates that live browser work
with the durable workspace exposed by this service.

Browser Session also sends status reports directly to Workspace Service. An in-memory presence
tracker renews a short lease for each report and makes the result available to Dashboard and MCP
readers. The same report may carry authentication observations derived from real platform
navigation responses or bounded page reads; the service validates, deduplicates, and persists them.
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
  platform-access summaries, profile facts, and job-search intents;
- `read_workspace_overview`, which reads the same workspace state;
- `job-boardwalk://jobs` and `read_job_library`, which expose the page-derived job library.

## HTTP API

The loopback HTTP surface currently exposes:

- `GET /api/workspace/overview`
- `PUT /api/browser-session/status`
- `POST /api/platform-access/observations`
- `POST /api/profile/facts`
- `DELETE /api/profile/facts/:id`
- `POST /api/search-intents`
- `PUT /api/search-intents/:id`
- `POST /api/search-intents/:id/select`
- `DELETE /api/search-intents/:id`
- `GET /api/jobs`
- `POST /api/jobs`

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
  "key": "工作经验",
  "value": "5 年后端开发",
  "source": "user",
  "confirmed": true,
  "reason": "用户明确说明工作经验"
}
```

The job-search-intent endpoint accepts:

```json
{
  "city": "北京",
  "initiatedBy": "user",
  "name": "北京 Node.js",
  "position": "Node.js",
  "reason": "用户维护当前求职方向",
  "recommendationPages": [
    {
      "label": "Node.js(北京)",
      "platformId": "boss",
      "url": "https://www.zhipin.com/web/geek/jobs"
    },
    {
      "label": "北京后端开发",
      "platformId": "yupao",
      "url": "https://www.yupao.com/topic/a2c1488/"
    }
  ],
  "selected": true
}
```

Dashboard and agents use the same write boundary. `initiatedBy` records whether a change came from
`user`, `agent`, or `system`. The schema guarantees at most one selected intent. Individual facts
and intents can be removed with `DELETE /api/profile/facts/:id` and
`DELETE /api/search-intents/:id`; mutations accept a JSON body containing `initiatedBy` and
`reason`.

### Job library

Browser Session submits the normalized facts exposed by job cards that are already present in a
supported recommendation page: title, company, location, salary text, detail tags, bounded card
text, and the original links. `POST /api/jobs` is the service-to-service write boundary.

Dashboard reads `GET /api/jobs` with `page`, `pageSize`, optional `query`, and optional `platform`
parameters. Workspace Service applies those constraints in SQLite and returns the current page,
total result count, and page count. `pageSize` is capped at 48.

Workspace Service first deduplicates observations by platform plus external job ID or job URL. It
merges a new cross-platform source only when normalized company, title, and location are all
available and match; partial cards remain separate to avoid false merges. An unchanged observation
only advances the source's latest check time. The database keeps the current normalized result and
original links, not page snapshots or match judgments.

Salary normalization preserves the platform's original `salaryText` and adds a CNY amount in K
with its source period. Monthly salary carries a month count only when the source explicitly says
something such as `13薪`. No annual package is calculated from monthly, daily, or hourly rates;
annual values are shown only when the source itself uses an annual salary period.

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
