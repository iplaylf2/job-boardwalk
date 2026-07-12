# State service

The state service owns Job Boardwalk's local SQLite database, semantic HTTP operations, and the
long-lived Shajara scope used by Hono routes. It never serves dashboard assets.

```sh
pnpm --filter @job-boardwalk/state-service dev
```

The service listens on <http://127.0.0.1:4310>.

For a production-style run:

```sh
pnpm --filter @job-boardwalk/state-service build
pnpm --filter @job-boardwalk/state-service start
```

## Local state

The SQLite database lives at `.job-boardwalk/data/workspace.sqlite` by default. Set
`JOB_BOARDWALK_HOME` to relocate the entire `.job-boardwalk` layout using either an absolute or a
working-directory-relative path. Older layouts are unsupported and are not imported.

The service is the sole SQLite writer. Agent integrations should use the semantic HTTP operations
instead of opening the database directly. The current operations are:

- `GET /api/workspace`
- `POST /api/profile/facts`
- `POST /api/search-intent/locations`

Workspace response types are owned by [`@job-boardwalk/state-api`](../../packages/state-api/).
`POST /api/profile/facts` accepts:

```json
{
  "key": "target-role",
  "value": "后端工程师",
  "source": "user",
  "confirmed": true,
  "reason": "用户明确说明目标岗位"
}
```

`POST /api/search-intent/locations` accepts:

```json
{
  "city": "上海",
  "priority": 1,
  "requirement": "required",
  "reason": "用户将上海设为首选城市"
}
```

The service binds only to `127.0.0.1`; mutation requests carrying a non-local browser origin are
rejected. Authentication cookies and Chromium profile contents are never returned by the API.
