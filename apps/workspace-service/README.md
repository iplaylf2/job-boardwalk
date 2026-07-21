# Workspace Service

Workspace Service owns Job Boardwalk's durable local state and workspace read model. It is the sole
owner of SQLite persistence. Its HTTP server exposes `/api` to Dashboard and `/mcp` to MCP clients;
it does not serve Dashboard assets or own a browser process. The production container listens on
its private network while Compose publishes the same service to host loopback for Browser Session
and the agent.

The repository's [product design](../../docs/product-design.md) defines the intended delegation and
browser-collaboration model. The current service preserves platform-access observations, profile
facts, job-search intents, normalized jobs and their platform sources, and research reports. Each
intent owns a target position, city, selection state, and per-platform recommendation-page
references. The service does not store recruiting pages or historical page snapshots. It stores
research reports as Markdown with structured lifecycle metadata and optional expiration.

Live web interaction belongs to the separate [`browser-session`](../browser-session/) application,
which owns the visible persistent Patchright browser. The agent coordinates that live browser work
with the durable workspace exposed by this service.

Browser Session also sends status reports directly to Workspace Service. An in-memory presence
tracker renews a short lease for each accepted status report and makes the result available to
Dashboard and MCP readers. A status report may also carry authentication observations derived from
real platform navigation responses or bounded page reads; the service validates, deduplicates, and
persists them. An expired lease is shown as offline rather than current browser state.

## Run Workspace Service

Workspace Service's production runtime is the root Compose deployment:

```sh
docker compose -f compose.yaml -f deploy/compose.build.yaml up --build --detach workspace-service
```

Its SQLite database lives in the `workspace-data` named volume. Compose publishes
<http://127.0.0.1:54310> without exposing the service on LAN interfaces.
The application build produces a self-contained `dist/` artifact with
`workspace-service.mjs` and the Drizzle baseline under `migrations/`. The application-owned
`Dockerfile` copies only that directory into the runtime image; source files, workspace manifests,
build dependencies, pnpm, and `node_modules` are absent.

For source development:

```sh
pnpm --filter @job-boardwalk/workspace-service dev
```

The development process listens on <http://127.0.0.1:54310> by default.

## Connect an MCP host

Configure the MCP host to use the Streamable HTTP endpoint at
<http://127.0.0.1:54310/mcp>. MCP requests share the service process, persistence layer, and
top-level shajara scope with the HTTP API.

The MCP surface provides:

- `job-boardwalk://workspace/overview`, a resource containing Browser Session presence,
  platform-access summaries, profile facts, and job-search intents;
- `read_workspace_overview`, which reads the same workspace state;
- `job-boardwalk://jobs`, which exposes the first page of the current job library;
- `read_job_library`, which reads that library with optional `page`, `pageSize`, `query`,
  `platformId`, and `interestedOnly` filters;
- `job-boardwalk://reports` and `list_research_reports`, which expose the directory of unexpired
  research reports;
- `read_research_report`, which reads one unexpired research report by ID;
- `save_research_report`, which creates a report or replaces one identified by ID.

## HTTP API

The HTTP surface currently exposes:

- `GET /health`
- `GET /api/workspace/overview`
- `PUT /api/browser-session/status`
- `POST /api/platform-access/observations`
- `POST /api/profile/facts`
- `PUT /api/profile/facts/:id`
- `DELETE /api/profile/facts/:id`
- `POST /api/search-intents`
- `PUT /api/search-intents/:id`
- `POST /api/search-intents/:id/select`
- `DELETE /api/search-intents/:id`
- `GET /api/jobs` (use `interested=true` for the interested slice)
- `POST /api/jobs`
- `PUT /api/job-interests`
- `GET /api/reports`
- `GET /api/reports/:id`
- `POST /api/reports`
- `PUT /api/reports/:id`
- `DELETE /api/reports/:id`

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

Workspace Service assigns `receivedAt` when it accepts the status report. A current lease appears
as `online`; an expired lease appears as `offline`; before the first status report, presence is
`unknown`. This presence state remains in memory and resets to `unknown` when Workspace Service
restarts. Platform-access observations carried in the status report are durable and are appended
only when the latest state for that platform changes.

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

Profile facts represent the user's current personal context. Creating a fact with
`POST /api/profile/facts` and replacing one with `PUT /api/profile/facts/:id` use the same body:

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
`user`, `agent`, or `system`. The schema guarantees unique profile-fact keys and at most one
selected intent. Individual facts and intents can be removed with
`DELETE /api/profile/facts/:id` and `DELETE /api/search-intents/:id`; mutations accept a JSON body
containing `initiatedBy` and `reason`.

### Job library

Browser Session submits the facts exposed by job cards that are already present in a supported
recruiting-platform page: title, company, location, salary text, detail tags, bounded card text, and
the original links. A selected job-search intent supplies recommendation pages that seed passive
collection. They do not limit collection to those pages: observations may come from any other open
supported-platform tab, and already-open tabs remain observable without a selected intent.
`POST /api/jobs` is the service-to-service write boundary.

Dashboard reads `GET /api/jobs` with `page`, `pageSize`, optional `query`, and optional `platform`
parameters. Workspace Service applies those constraints in SQLite and returns the current page,
total result count, and page count. `pageSize` is capped at 48.

Within one platform, Workspace Service identifies a source by its external job ID when available,
then by the pathname of its job URL, and finally by normalized company, title, and location when no
detail link is available. Browser Session supplies an external ID only when a recognized
platform-specific job-detail path exposes one. When that path contains separate identifier and
display-slug segments, the identifier becomes the preferred identity, so changing the slug does not
split the source. Workspace Service merges a new cross-platform source only when normalized company,
title, and location are all available and match. Partial cards remain separate to avoid false
merges. An unchanged observation only advances the source's latest check time. The database keeps
the current normalized result and original links, not page snapshots or match judgments.

Salary normalization preserves the platform's original `salaryText` and adds a CNY amount in K
with its source period. Monthly salary carries a month count only when the source explicitly says
something such as `13薪`. No annual package is calculated from monthly, daily, or hourly rates;
annual values are shown only when the source itself uses an annual salary period.

#### Platform interest relations

`PUT /api/job-interests` synchronizes a snapshot of one platform's current “感兴趣” list. Workspace
Service stores the state as a relation on the matching platform source rather than as a second job
collection. A complete snapshot replaces relations that are no longer present; a partial snapshot
only adds or refreshes observed relations. Removing a relation never removes the job or its other
platform sources from the library.

`GET /api/jobs?interested=true` returns jobs with at least one interested source. Each relation
records when it was first and most recently observed and its position in the latest snapshot.

### Research reports

A report contains a title, Markdown body, `draft` or `complete` state, creation and update times,
and an optional expiration time. List and detail reads omit expired reports. Creating, replacing,
and deleting a report records a workspace change with its user, agent, or system attribution.

Markdown is stored as authored. Workspace Service validates the report contract but does not turn
the document into HTML; each presentation boundary owns its rendering policy. Report authors should
keep supporting evidence and uncertainty beside their conclusions and link back to durable
workspace facts or original sources when available.

## Persistence

The Compose deployment stores SQLite at `/var/lib/job-boardwalk/workspace.sqlite` in the
`workspace-data` named volume. The database therefore survives container replacement and
`docker compose down`; deleting the named volume explicitly deletes the workspace.

For source development, the database lives under the operating system's user data directory by
default. Set `JOB_BOARDWALK_WORKSPACE_DATABASE_PATH` to choose the exact database path. Relative
values resolve from the current working directory. Workspace Service neither knows nor shares
Browser Session's profile location.

The Drizzle schema lives in `src/persistence/schema.ts`. The `migrations/` directory contains
exactly one complete baseline for the current model, not an upgrade chain. Existing databases from
earlier exploratory models are unsupported and must be deleted before starting this version.
The Vite build emits this directory as runtime assets under `dist/migrations`; the source directory
remains the schema generation target and source of truth.

During exploration, a schema change replaces both the database and the baseline. Remove the local
database and current migration directory, then generate one new baseline from the complete schema.
Do not add transitional or compatibility SQL.

```sh
pnpm --filter @job-boardwalk/workspace-service db:generate
```

## Local security boundary

The source-development listener binds to `127.0.0.1`. In Compose, the process binds to `0.0.0.0`
inside its isolated network so Dashboard can reach it, but Docker publishes port 54310 only on host
loopback. Non-GET API and MCP requests carrying a non-local browser origin are rejected. The service
has no access to authentication cookies or browser profile contents. Origin filtering is not
authentication; local processes and the private Compose network are inside the service trust
boundary. Local state is created with owner-only permissions on systems that support POSIX modes.

`JOB_BOARDWALK_WORKSPACE_SERVICE_HOST` accepts a Node.js listener hostname and defaults to
`127.0.0.1`.
`JOB_BOARDWALK_WORKSPACE_SERVICE_PORT` accepts a TCP port and defaults to `54310`. Compose owns both
production values; users do not need to set them.

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
