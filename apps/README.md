# Applications

- [`browser-session`](browser-session/) owns the Patchright CDP connection and MCP browser contract.
- [`workspace-service`](workspace-service/) owns durable local state and recruiting-domain APIs.
- [`dashboard`](dashboard/) presents a read-only view of that durable state.

Edge or Chrome runs with a dedicated profile on the graphical host. Browser Session is a long-lived
local HTTP MCP service that attaches with Patchright CDP but never owns the browser process. The
agent host connects directly to Browser Session. Workspace Service and Dashboard never access the
browser profile.

[Product design](../docs/product-design.md) owns cross-application behavior. Each application README
owns only that application's current responsibilities, configuration, and operation.
