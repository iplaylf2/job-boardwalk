# Desktop Distribution

Desktop Distribution is Job Boardwalk's private desktop-product build coordinator. It implements
the product-specific assembly and packaging boundary defined by
[Desktop distribution](../../docs/desktop-distribution.md).

## Responsibility

The package owns:

- assembly of the documented desktop-product layout and its integrity manifest;
- the explicit allowlist of application-owned build artifacts;
- build-time validation that resources stay within the product directory contract;
- future platform-packager configuration and invocation;
- release-input, signing, notarization, and provenance policy.

It consumes finalized application artifacts. It does not own their construction or behavior,
runtime supervision, browser automation, update behavior, or release-channel decisions. The
installed layout in [Desktop distribution](../../docs/desktop-distribution.md) is the product
contract; assembly tests and Desktop Manager tests independently verify their owned sides of that
contract.

## Current implementation

The current implementation assembles Desktop Manager, Desktop Service Host, a build-supplied Caddy
executable, Browser Session, Dashboard, Workspace Service, and migrations into a deterministic
staging tree and writes its integrity manifest. The staged lifecycle runs without Docker, a system
Node.js or Caddy installation, `node_modules`, or a bundled browser.

The staging tree remains an engineering artifact.
[Desktop distribution](../../docs/desktop-distribution.md) owns the installed-form contract,
release readiness criteria, and remaining delivery work.

Node.js executes the package's TypeScript entrypoints directly, with no generated JavaScript copy.
Vitest tests the assembly boundary, Cargo supplies structured Rust package metadata, and Node's
standard library supplies filesystem operations.

## Commands

Build the application dependencies and assemble the current staging tree:

```sh
JOB_BOARDWALK_DESKTOP_CADDY_EXECUTABLE=/absolute/path/to/caddy \
  pnpm exec moon run desktop-distribution:assemble
```

The input must be a platform-native Caddy executable that can load the product Caddyfile. The
assembler verifies that compatibility before copying it. The desktop distribution contract defines
the remaining release-input and packaging responsibilities.

The command writes
`target/desktop-distribution/<platform>-<architecture>/Job Boardwalk/`.

For engineering validation, run `bin/job-boardwalk-desktop-manager` from the assembled product
directory. This does not make the staging tree a supported product topology.

Run its direct checks:

```sh
pnpm exec moon run \
  desktop-distribution:lint \
  desktop-distribution:typecheck \
  desktop-distribution:test
```
