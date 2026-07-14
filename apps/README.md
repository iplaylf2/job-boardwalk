# Applications

- [`browser-session`](browser-session/) owns the visible-browser gateway, stable browser workflows,
  and agent-facing Playwright MCP surface; the graphical host owns the browser itself.
- [`workspace-service`](workspace-service/) owns durable local state and recruiting-domain APIs.
- [`dashboard`](dashboard/) presents a read-only view of that durable state.

Playwright MCP and the official extension run on the graphical host. The agent host launches Browser
Session as a stdio MCP child process, which may run in a separate agent environment and reaches the
graphical host through its configured MCP endpoint. Workspace Service and Dashboard remain
independent of the graphical host and never access its browser profile.

[Product design](../docs/product-design.md) owns cross-application behavior. Each application README
owns only that application's current responsibilities, configuration, and operation.
