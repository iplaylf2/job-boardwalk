# Desktop Service Host

Desktop Service Host is the application-specific Node.js executable in the directory-contained
desktop product. It loads exactly one finalized service payload per invocation. Desktop Manager,
not the host, owns service order, readiness, failure containment, and ordered shutdown. The loaded
service owns its application lifecycle and resource cleanup.

## Runtime contract

The host accepts two product-owned roles:

- `workspace-service` loads the finalized Workspace Service entry module.
- `browser-session` loads the finalized Browser Session entry module.

Desktop Manager supplies each role's public entry module and runtime paths as explicit absolute
arguments. Service-specific arguments remain on the same process command line for the loaded service
to interpret; the host does not inspect them. The host loads the entry module directly and requires
a `serviceCompletion` promise export. The promise represents the complete application-owned service
lifecycle, not startup readiness. While it is pending, the host keeps its standard-input shutdown
adapter active. When it fulfills or rejects, the host removes that adapter and exits, allowing
Desktop Manager to observe the service outcome through the child process.

Standard-input EOF from Desktop Manager emits an in-process `SIGTERM` event. This invokes the
service's ordinary signal handler without using Windows' terminating `process.kill()` signal
emulation. Workspace Service and Browser Session therefore remain independent of Manager's stdin
protocol and retain responsibility for their own graceful cleanup.

The host does not derive the product layout, inspect dependency or resource trees, discover
browsers, supervise sibling processes, expose a Manager-specific protocol, or use shajara to model
process topology.

[Desktop distribution](../../docs/desktop-distribution.md#runtime-payload) owns the installed
process topology that connects Manager, this host, and the finalized service payloads.

## Build and checks

Node.js builds the bundled CommonJS entry into a single executable application:

```sh
pnpm exec moon run desktop-service-host:build
```

The resulting executable is `target/release/node-service-host` on Linux and
`target/release/node-service-host.exe` on Windows. It is an application-specific runtime host, not
a general-purpose Node.js distribution. Desktop Manager starts a separate host process for each
Node service. The selected payload resolves production dependencies from its own application-owned
directory; neither the host nor the payload relies on a system Node.js installation or the source
workspace.

Run focused checks with:

```sh
pnpm exec moon run \
  desktop-service-host:lint \
  desktop-service-host:typecheck \
  desktop-service-host:test
```
