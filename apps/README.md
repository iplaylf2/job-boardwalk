# Applications

- [`browser-session`](browser-session/) owns the visible browser and agent-facing Playwright MCP
  surface.
- [`workspace-service`](workspace-service/) owns durable local state and recruiting-domain APIs.
- [`dashboard`](dashboard/) presents a read-only view of that durable state.

The Browser Session must run in the user's graphical environment. The Workspace Service and
Dashboard remain independent of that environment and never access its browser profile.

[Product design](../docs/product-design.md) owns cross-application behavior. Each application README
owns only that application's current responsibilities, configuration, and operation.
