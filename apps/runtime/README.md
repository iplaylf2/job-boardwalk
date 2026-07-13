# Local runtime

The runtime coordinates Job Boardwalk's local workspace. It is the sole owner of SQLite
persistence, managed browser sessions, and platform authentication observations. Its loopback HTTP
server exposes `/api` to the dashboard and `/mcp` to MCP clients; it does not serve dashboard
assets.

The repository's [product design](../../docs/product-design.md) defines the target delegation and
browser-control model. The current runtime is its operational foundation: it can read workspace
state, report browser availability, and open a visible platform browser. It does not yet expose job
search, result collection, job-detail reading, or browser-control transfer to the agent.

## Concurrency model

The process owns one top-level shajara scope. Asynchronous HTTP and MCP work, browser background
tasks, and the managed browser lifetime converge through that scope. Runtime workflows use
`RiteCoroutine`; Promise-returning platform and transport APIs enter routines through `until(...)`.
During shutdown, the runtime stops accepting requests, cancels the scope, waits for owned work to
finish, and then closes SQLite.

## Run the runtime

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

Configure the MCP host to use the Streamable HTTP endpoint at
<http://127.0.0.1:54310/mcp>. MCP requests share the runtime process, workspace repository,
managed browser, and top-level shajara scope with the HTTP API.

The MCP surface provides:

- `job-boardwalk://workspace/overview`, a resource containing platform access, profile facts, and
  target locations;
- `read_workspace_overview`, which reads the same workspace state;
- `read_browser_availability`, which reports whether managed Chromium is available;
- `open_platform_browser`, which opens a visible platform window at its login or browsing page.

`open_platform_browser` accepts `purpose: "login" | "browse"`. The runtime may observe the
presence of platform authentication cookies, but credentials and verification input remain inside
the platform window.

## Runtime HTTP API

The loopback HTTP surface currently exposes:

- `GET /api/workspace/overview`
- `GET /api/browser/availability`
- `POST /api/profile/facts`
- `POST /api/search-intent/locations`
- `POST /api/platforms/:platformId/browser/open`

Shared response types live in [`@job-boardwalk/contracts`](../../packages/contracts/). The profile
fact write operation accepts:

```json
{
  "key": "target-role",
  "value": "后端工程师",
  "source": "user",
  "confirmed": true,
  "reason": "用户明确说明目标岗位"
}
```

The target location write operation accepts:

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

The runtime binds only to `127.0.0.1`. API mutations and MCP requests carrying a non-local browser
origin are rejected. Authentication cookies and Chromium profile contents are never returned
through HTTP or MCP. Local state is created with owner-only permissions on systems that support
POSIX modes.
