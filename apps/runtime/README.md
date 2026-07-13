# Local runtime

The runtime coordinates Job Boardwalk's local workspace. It is the sole owner of SQLite
persistence, managed browser sessions, platform authentication observations, and the loopback HTTP
API used by the dashboard and MCP adapter. It does not serve dashboard assets.

The repository's [product design](../../docs/product-design.md) defines the target delegation and
browser-control model. The current runtime is its operational foundation: it can read workspace
state and hand off a visible browser, but it does not yet expose job search, result collection,
job-detail reading, or browser-control transfer to the agent.

## Run the HTTP runtime

For development:

```sh
pnpm --filter @job-boardwalk/runtime dev
```

The runtime listens on <http://127.0.0.1:54310>.

For a production-style run:

```sh
pnpm --filter @job-boardwalk/runtime build
pnpm --filter @job-boardwalk/runtime start
```

## Connect an MCP host

Keep the HTTP runtime running and launch the stdio MCP adapter as a separate process:

```sh
pnpm --filter @job-boardwalk/runtime mcp
```

The MCP surface provides:

- `job-boardwalk://workspace/overview`, a resource containing the current workspace overview;
- `read_workspace_overview`, which reads that overview for analysis;
- `read_browser_availability`, which reports whether managed Chromium is available;
- `handoff_platform_browser`, which opens or focuses a visible platform window.

`handoff_platform_browser` accepts `purpose: "login" | "browse"`. The runtime may observe the
presence of platform authentication cookies, but credentials and verification input remain inside
the platform window.

## Dashboard HTTP API

The dashboard uses these loopback operations:

- `GET /api/workspace/overview`
- `GET /api/browser/availability`
- `POST /api/profile/facts`
- `POST /api/search-intent/locations`
- `POST /api/platforms/:platformId/browser-handoff`

Shared response contracts are owned by
[`@job-boardwalk/contracts`](../../packages/contracts/). Profile fact updates accept:

```json
{
  "key": "target-role",
  "value": "后端工程师",
  "source": "user",
  "confirmed": true,
  "reason": "用户明确说明目标岗位"
}
```

Target location updates accept:

```json
{
  "city": "上海",
  "priority": 1,
  "requirement": "required",
  "reason": "用户将上海设为首选城市"
}
```

## Persistence

The SQLite database lives at `.job-boardwalk/data/workspace.sqlite` by default. Set
`JOB_BOARDWALK_HOME` to relocate the entire `.job-boardwalk` directory. Relative values resolve
from the current working directory. Older storage layouts are unsupported and are not imported.

The Drizzle schema lives in `src/persistence/schema.ts`, and versioned SQL migrations live in
`migrations/`. After changing the schema, generate the next migration with:

```sh
pnpm --filter @job-boardwalk/runtime db:generate
```

## Local security boundary

The runtime binds only to `127.0.0.1`. Mutation requests carrying a non-local browser origin are
rejected. Authentication cookies and Chromium profile contents are never returned through HTTP or
MCP. Local state is created with owner-only permissions on systems that support POSIX modes.
