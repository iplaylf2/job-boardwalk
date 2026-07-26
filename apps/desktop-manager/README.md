# Desktop Manager

Desktop Manager is Job Boardwalk's native desktop control surface. It uses Slint with its Rust API
and does not embed Dashboard, recruiting pages, a browser engine, or a WebView. Dashboard remains a
browser application; Browser Session remains the only owner of the visible recruiting browser and
its dedicated profile.

The manager starts the sibling Desktop Runtime, sends its bounded shutdown command, consumes
versioned status events, and presents runtime and system-browser discovery state. It provides
Start, Stop, Open Logs, and Open Dashboard controls. Desktop Runtime's standard error is appended
to `data/logs/runtime.log`; the GUI does not read workspace persistence or service-private APIs.

## Run

Install the root pnpm dependencies and the Rust toolchain declared in
[`rust-toolchain.toml`](../../rust-toolchain.toml). On Linux, building the Winit backend also
requires a C toolchain and the development packages for the host's X11 or Wayland stack,
xkbcommon, OpenGL, and fontconfig.

Build the desktop staging tree, then run Desktop Manager from that product directory:

```sh
pnpm install --frozen-lockfile
pnpm exec moon run desktop-distribution:assemble
target/desktop-distribution/<platform>-<architecture>/Job\ Boardwalk/bin/job-boardwalk-desktop-manager
```

Desktop Manager resolves Desktop Runtime beside itself under `bin/`. Source development may set
`JOB_BOARDWALK_DESKTOP_RUNTIME_EXECUTABLE` to an assembled runtime explicitly; an installed run
does not depend on that override.

## Lifecycle boundary

The protocol is a stream of length-delimited Protobuf messages over the child process's standard
input and output. Its language-neutral source is
[`desktop_lifecycle.proto`](../../proto/job_boardwalk/desktop_lifecycle/v1/desktop_lifecycle.proto);
Buf generates the checked-in Protobuf-ES and Prost consumers and the repository checks them for
drift. Service logs use stderr, so they cannot be mistaken for protocol events.

Desktop Manager owns the Desktop Runtime process and operating-system handoffs. Desktop Runtime
owns service startup, readiness, failure reporting, and ordered shutdown. Desktop Manager does not
expose a tray, install the application, perform updates, read workspace persistence, or control
recruiting pages.

[Desktop distribution](../../docs/desktop-distribution.md) defines the directory-contained,
Docker-free installed form and remaining release boundary. Desktop Manager is the lifecycle
control surface, not the installer.

[Product design](../../docs/product-design.md) owns the cross-application boundary.
[Development](../../docs/development.md) owns the polyglot workspace and CI model.
