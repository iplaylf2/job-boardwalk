# Desktop Service Host

Desktop Service Host is the application-specific Node.js executable in the directory-contained
desktop product. It starts exactly one finalized service payload per invocation. Desktop Manager,
not this executable, owns service order, readiness, failure containment, and shutdown.

The host supports two roles:

- `workspace-service` loads the finalized Workspace Service entry module.
- `browser-session` loads the finalized Browser Session entry module. Desktop Manager supplies the
  browser executable selected by the desktop integration layer and the dedicated product profile.

Desktop Manager supplies each role's public entry module and runtime paths as explicit absolute
arguments. The host loads that file directly. It does not derive the product layout, inspect the
service's dependency or resource layout, discover browsers, supervise sibling processes, expose a
manager protocol, or use shajara to model process topology.

After loading a service module, the host converts stdin EOF from Desktop Manager to `SIGTERM`.
Workspace Service and Browser Session handle normal process signals and remain independent of
Manager's stdin protocol.

## Build and checks

Node.js builds the bundled CommonJS entry into a single executable application:

```sh
pnpm exec moon run desktop-service-host:build
```

The resulting executable is
`target/release/job-boardwalk-desktop-service-host` or its platform equivalent. It is an
application-specific runtime host, not a general-purpose Node.js distribution. The executable is
shared by the isolated Node service processes. A finalized artifact may load production
dependencies from its own application-owned directory; it never relies on a system Node.js
installation or the source workspace.

Run focused checks with:

```sh
pnpm exec moon run \
  desktop-service-host:lint \
  desktop-service-host:typecheck \
  desktop-service-host:test
```
