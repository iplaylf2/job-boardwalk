# Applications

- [`browser-session`](browser-session/) owns the visible persistent browser and the MCP browser
  contract.
- [`workspace-service`](workspace-service/) owns durable recruiting state, research reports, and
  recruiting-domain APIs.
- [`dashboard`](dashboard/) presents workspace state and lets the user maintain personal context
  and job-search intents.
- [`desktop-runtime`](desktop-runtime/) coordinates the services inside the directory-contained
  desktop product.
- [`desktop-manager`](desktop-manager/) owns the native desktop control surface and
  operating-system handoffs.

Each application README documents that application's operation and maintenance. Cross-application
behavior belongs in [Product design](../docs/product-design.md); the supported Compose topology
belongs in [Deployment](../docs/deployment.md); the desktop engineering topology and target
installed form belong in [Desktop distribution](../docs/desktop-distribution.md).
