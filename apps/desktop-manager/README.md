# Desktop Manager

Desktop Manager is Job Boardwalk's native desktop control surface. It uses Slint with its Rust API
and does not embed Dashboard, recruiting pages, a browser engine, or a WebView. Dashboard remains a
browser application; Browser Session remains the only owner of the visible recruiting browser and
its dedicated profile.

The manager starts Workspace Service and Browser Session through the sibling Desktop Service Host,
and starts the packaged Caddy executable for Dashboard. It waits on their HTTP health endpoints
and presents aggregate runtime state. It provides Start and Stop controls and displays the
Dashboard address and absolute service log path so users can copy either value even when no
operating-system URL or file handler is available. Service output is appended to
`data/logs/services.log`; the GUI does not read workspace persistence or service-private APIs.

## Run

Install the root pnpm dependencies and the Rust toolchain declared in
[`rust-toolchain.toml`](../../rust-toolchain.toml). On Linux, building the Winit backend also
requires a C toolchain and the development packages for the host's X11 or Wayland stack,
xkbcommon, OpenGL, and fontconfig.

Build the desktop staging tree, then run Desktop Manager from that product directory:

```sh
pnpm install --frozen-lockfile
JOB_BOARDWALK_DESKTOP_CADDY_EXECUTABLE=/absolute/path/to/caddy \
  pnpm exec moon run desktop-distribution:assemble
target/desktop-distribution/<platform>-<architecture>/Job\ Boardwalk/bin/job-boardwalk-desktop-manager
```

The build input must be a platform-native Caddy executable that can load the product Caddyfile.
Desktop Manager resolves Caddy and Desktop Service Host beside itself under `bin/`. Source
development may set
`JOB_BOARDWALK_DESKTOP_SERVICE_HOST_EXECUTABLE` to an assembled host explicitly; an installed run
does not depend on that override. [Desktop distribution](../../docs/desktop-distribution.md)
defines release-input and packaging policy.

## Lifecycle boundary

Desktop Manager is the only owner of the desktop process topology. It starts Workspace Service,
Caddy, and Browser Session in dependency order, checks their HTTP readiness, observes unexpected
exits, and stops them in reverse order. To stop a Node.js service, Manager closes the child host's
standard input; Desktop Service Host converts that EOF to `SIGTERM`. Caddy shuts down through its
loopback-only admin endpoint. Manager terminates a child only when it exceeds the bounded shutdown
period.

The services expose no manager-specific control protocol. Manager relies on explicit arguments,
health endpoints, exit status, and log streams. It does not expose a tray, install the application,
perform updates, read workspace persistence, or control recruiting pages.

[Desktop distribution](../../docs/desktop-distribution.md) defines the directory-contained,
Docker-free installed form and remaining release boundary. Desktop Manager is the lifecycle
control surface, not the installer.

[Product design](../../docs/product-design.md) owns the cross-application boundary.
[Development](../../docs/development.md) owns the polyglot workspace and CI model.
