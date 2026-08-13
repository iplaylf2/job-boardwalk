# Desktop Manager

Desktop Manager is Job Boardwalk's native desktop control surface. It uses Slint with its Rust API
and does not embed Dashboard, recruiting pages, a browser engine, or a WebView. Dashboard remains a
browser application; Browser Session remains the only owner of the visible recruiting browser and
its dedicated profile.

## Product behavior

The Manager presents Job Boardwalk as one local application. Its Start and Stop controls operate
the complete local runtime, while the service overview distinguishes core availability from the
optional browser capability. When that capability is unavailable, the workspace and Dashboard keep
running while the application presents an actionable limited state.

The main window also exposes the Dashboard address and absolute service log path so either can be
copied without operating-system URL or file integration. Service output is appended to
`data/logs/services.log`; the GUI does not read workspace persistence or service-private APIs. On
Windows, Manager starts its private service processes without console windows; their process
lifecycle and failure state remain visible through the GUI.

When services are stopped, Settings configures the three product loopback ports and an optional
absolute browser executable override. A blank override discovers Chrome, Edge, or Chromium in the
platform's common system locations. Manager validates distinct, non-zero ports and the configured
file before atomically replacing `data/settings.json`, so saving never exposes a partially written
settings file. Saved settings apply on the next start. Product-owned executables,
payloads, persistence, profile paths, and lifecycle control channels remain derived from the
installed product directory and are not user-configurable.

Engineering staging may provide the browser override through
`JOB_BOARDWALK_BROWSER_EXECUTABLE_PATH`. This development convenience is neither persisted nor part
of installed-product discovery. [Desktop distribution](../../docs/desktop-distribution.md) owns
the complete installed-browser policy.

## Run

Install the root pnpm dependencies and the Rust toolchain declared in
[`rust-toolchain.toml`](../../rust-toolchain.toml). On Linux, building the Winit backend also
requires a C toolchain and the development packages for the host's X11 or Wayland stack,
xkbcommon, and fontconfig.

Build the desktop staging tree, then run Desktop Manager from that product directory:

```sh
pnpm install --frozen-lockfile
JOB_BOARDWALK_DESKTOP_CADDY_EXECUTABLE=/absolute/path/to/caddy \
  pnpm exec moon run desktop-distribution:assemble
target/desktop-distribution/<platform>-<architecture>/job-boardwalk/job-boardwalk
```

The final line is the Linux entrypoint. On Windows, launch
`target\desktop-distribution\win32-<architecture>\job-boardwalk\job-boardwalk.exe`. The complete
platform-specific assembly and packaging commands belong to
[Desktop Distribution](../../internal/desktop-distribution/README.md#commands).

The build input must be a platform-native Caddy executable that can load the product Caddyfile.
Desktop Manager runs as the root product entrypoint and resolves Caddy and Desktop Service Host
under `runtime/`. Source development may set
`JOB_BOARDWALK_NODE_SERVICE_HOST_EXECUTABLE` to an assembled host explicitly; an installed run does
not depend on that override. Manager selects Slint's software renderer so the control surface does
not require GPU acceleration in remote-desktop, virtual-machine, or GPU-limited sessions.
[Desktop distribution](../../docs/desktop-distribution.md) defines release-input and packaging
policy.

## Lifecycle boundary

Desktop Manager is the desktop composition root. It resolves the browser override or system
installation, starts Workspace Service, Caddy, and Browser Session in dependency order, checks
Workspace Service and Dashboard HTTP availability and Browser Session's reported browser
availability, translates their state into the product UI, observes unexpected exits, and stops them
in reverse order. To stop a Node.js service, Manager closes the child host's standard input; the
Desktop Service Host routes that EOF through the service's ordinary `SIGTERM` handler on every
platform. The host exits when the loaded service's exported lifecycle completion settles, so
Manager can observe failures that occur before or after readiness. Caddy shuts down through a
private, start-scoped loopback admin endpoint selected by Manager. Manager reserves that address
until it hands the endpoint to Caddy at process launch; the address is never displayed or
persisted. Manager forcibly terminates a child only when it exceeds the bounded shutdown period.

The services expose no manager-specific control protocol. Manager relies on explicit arguments,
health endpoints, exit status, and log streams. It does not expose a tray, install the application,
perform updates, read workspace persistence, or control recruiting pages.

[Desktop distribution](../../docs/desktop-distribution.md) defines the directory-contained,
Docker-free installed form and remaining release boundary. Desktop Manager is the lifecycle
control surface, not the installer. [Desktop Service Host](../desktop-service-host/) documents the
Node service-host side of the shutdown adapter.

[Product design](../../docs/product-design.md) owns the cross-application boundary.
[Development](../../docs/development.md) owns the polyglot workspace and CI model.
