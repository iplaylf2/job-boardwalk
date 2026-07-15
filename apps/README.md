# Applications

- [`browser-session`](browser-session/) owns the visible persistent browser and MCP browser contract.
- [`workspace-service`](workspace-service/) owns durable local state and recruiting-domain APIs.
- [`dashboard`](dashboard/) presents a read-only view of durable workspace data and leased Browser
  Session presence.

Browser Session launches Patchright Chromium with a dedicated local profile and owns that process
for its service lifetime. The agent host connects directly to Browser Session. Workspace Service
and Dashboard never access the browser profile. Browser Session sends bounded runtime status reports
to Workspace Service, which derives short-lived presence for Dashboard without taking ownership of
the browser.

[Product design](../docs/product-design.md) owns cross-application behavior and intended product
direction. Each application README owns that application's current responsibilities, configuration,
and operation.
