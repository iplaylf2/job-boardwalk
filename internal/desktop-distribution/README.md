# Desktop Distribution

Desktop Distribution is Job Boardwalk's private desktop-product build coordinator. It implements
the product-specific assembly and packaging boundary defined by
[Desktop distribution](../../docs/desktop-distribution.md).

## Responsibility

The package owns:

- assembly of the documented desktop-product layout and its integrity manifest;
- the explicit allowlist of application-owned build artifacts;
- build-time validation that resources stay within the product directory contract;
- selection and invocation of the native archive tool.

It consumes finalized application artifacts. It does not own their construction or behavior,
runtime supervision, browser automation, update behavior, release version selection, release-file
checksums, signing credentials, provenance, license policy, or release-channel decisions.
[Desktop distribution](../../docs/desktop-distribution.md) owns the installed layout and release
boundary; assembly tests and Desktop Manager tests independently verify their owned sides of that
contract.

## Current implementation

The current implementation assembles Desktop Manager, Desktop Service Host, a build-supplied Caddy
executable, Browser Session, Dashboard, and Workspace Service into a deterministic
staging tree and writes its integrity manifest. The staged lifecycle runs without Docker, a system
Node.js or Caddy installation, a source checkout, or a bundled browser. Both Node services arrive
as finalized runtime directories; Desktop Distribution does not interpret their entry modules or
dependency graphs. Desktop Manager uses an installed system browser or an explicit executable
override as defined by the product contract.

On native Linux or Windows, the package task creates a portable archive from the assembled product.

The staging tree and archives remain engineering artifacts.

Node.js executes the package's TypeScript entrypoints directly, with no generated JavaScript copy.
Vitest tests the assembly and archive-coordination boundaries, Cargo supplies structured Rust
package metadata, and Node's standard library coordinates filesystem and process work around the
native archive tools.

## Commands

Build the application dependencies and assemble the current staging tree:

```sh
JOB_BOARDWALK_DESKTOP_CADDY_EXECUTABLE=/absolute/path/to/caddy \
  pnpm exec moon run desktop-distribution:assemble
```

The input must be a platform-native Caddy executable that can load the product Caddyfile. The
assembler verifies that compatibility before copying it.

The command writes
`target/desktop-distribution/<platform>-<architecture>/Job Boardwalk/`.

For engineering validation, run `bin/job-boardwalk-desktop-manager` from the assembled product
directory. This does not make the staging tree a supported product topology.

Create the native portable archive on Linux or Windows:

```sh
JOB_BOARDWALK_DESKTOP_CADDY_EXECUTABLE=/absolute/path/to/caddy \
  pnpm exec moon run desktop-distribution:package
```

The command writes a Linux `.tar.gz` or Windows `.zip` under
`target/desktop-distribution/releases/`.

Run its direct checks:

```sh
pnpm exec moon run \
  desktop-distribution:lint \
  desktop-distribution:typecheck \
  desktop-distribution:test
```
