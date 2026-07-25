# Applications

- [`browser-session`](browser-session/) owns the visible persistent browser and MCP browser contract.
- [`workspace-service`](workspace-service/) owns durable local state, Markdown research reports,
  and recruiting-domain APIs.
- [`dashboard`](dashboard/) presents workspace state and research reports, and lets the user
  maintain personal context and job-search intents.
- [`desktop-manager`](desktop-manager/) owns the native local-runtime control surface. Its current
  implementation provides the operating-system handoff to Dashboard.

Browser Session launches Patchright Chromium with a dedicated local profile and owns that process
for its service lifetime in the user's graphical host session. It is deliberately outside Docker;
the agent host connects to it directly. Workspace Service and Dashboard run as separate Compose
services and never access the browser profile. Browser Session reaches the containerized Workspace
Service through its loopback-published port and sends bounded status reports containing runtime
status and any cached platform-access observations. Workspace Service derives short-lived presence
for Dashboard without taking ownership of the browser.

Desktop Manager is a Slint application and deliberately does not embed Dashboard or recruiting
pages. Its current implementation opens Dashboard in the user's browser and makes no claim about
service availability. The native GUI remains outside Browser Session's page-control boundary.

[Product design](../docs/product-design.md) owns cross-application behavior and intended product
direction. Each application README owns that application's current responsibilities, configuration,
and operation. Each containerized application also owns its Dockerfile and complete `dist/`
deployment artifact. [Deployment](../docs/deployment.md) owns the cross-application runtime
topology and lifecycle.
