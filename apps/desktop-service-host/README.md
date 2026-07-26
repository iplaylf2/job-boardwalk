# Desktop Service Host

Desktop Service Host is the application-specific Node.js executable in the directory-contained
desktop product. It starts exactly one finalized service payload per invocation. Desktop Manager,
not this executable, owns service order, readiness, failure containment, and shutdown.

The host supports two roles:

- `workspace-service` loads the finalized Workspace Service module.
- `browser-session` discovers a system Chrome or Edge executable that reports a recognizable
  version, passes it to the finalized Browser Session module, and uses the dedicated product
  profile supplied by Desktop Manager. Browser Session startup remains the compatibility check.

Every role receives its module and runtime paths as explicit absolute arguments. The host does not
derive the product layout, supervise sibling processes, expose a manager protocol, or use shajara
to model process topology.

## Build and checks

Node.js builds the bundled CommonJS entry into a single executable application:

```sh
pnpm exec moon run desktop-service-host:build
```

The resulting executable is
`target/release/job-boardwalk-desktop-service-host` or its platform equivalent. It is an
application-specific runtime host, not a general-purpose Node.js distribution.

Run focused checks with:

```sh
pnpm exec moon run \
  desktop-service-host:lint \
  desktop-service-host:typecheck \
  desktop-service-host:test
```
