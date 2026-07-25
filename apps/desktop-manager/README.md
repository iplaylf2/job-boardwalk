# Desktop Manager

Desktop Manager is Job Boardwalk's native local-runtime control surface. Its current implementation
is limited to opening Dashboard through the operating system. It uses Slint with its Rust API and
does not embed Dashboard, recruiting pages, a browser engine, or a WebView. Dashboard remains a
browser application; Browser Session remains the only owner of the visible recruiting browser and
its dedicated profile.

The application rows report `Controls unavailable`. This describes Desktop Manager's current
capability, not the availability of the listed applications.

## Run

Install the root pnpm dependencies and the Rust toolchain declared in
[`rust-toolchain.toml`](../../rust-toolchain.toml), then run:

```sh
pnpm install --frozen-lockfile
pnpm exec moon run cargo-workspace:run-desktop-manager
```

On Linux, building the Winit backend requires a C toolchain and the development packages for the
host's X11 or Wayland stack, xkbcommon, OpenGL, and fontconfig.

## Current contract

The current implementation owns only the native window and the request to open the fixed local
Dashboard URL through the operating system. It does not yet inspect service state, start or stop
processes, expose a tray, install the application, perform updates, read workspace persistence, or
control recruiting pages.

## Planned lifecycle boundary

When local lifecycle management is implemented, the application runtime supervisor will own
process coordination under one top-level shajara scope and expose a bounded local protocol to
Desktop Manager. No supervisor or protocol is implemented yet.

[Desktop distribution](../../docs/desktop-distribution.md) defines the target directory-contained,
Docker-free installed form and release boundary. Desktop Manager is the lifecycle control surface,
not the installer.

[Product design](../../docs/product-design.md) owns the intended cross-application boundary.
[Development](../../docs/development.md) owns the polyglot workspace and CI model.
