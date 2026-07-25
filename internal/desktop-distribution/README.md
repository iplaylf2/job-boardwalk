# Desktop Distribution

Desktop Distribution is Job Boardwalk's private desktop-product build coordinator. It implements
the product-specific assembly and packaging boundary defined by
[Desktop distribution](../../docs/desktop-distribution.md).

## Responsibility

The package owns:

- assembly of the shared desktop-product layout and its integrity manifest;
- the explicit allowlist of application-owned build artifacts;
- build-time validation that resources stay within the product directory contract;
- platform-packager configuration and invocation;
- signing, notarization, provenance, and release-input policy.

It consumes finalized application artifacts. It does not own their construction or behavior,
runtime supervision, browser automation, update behavior, or release-channel decisions.
[`@job-boardwalk/desktop-product-layout`](../../packages/desktop-product-layout/) owns the path
contract consumed by both this assembler and Application Runtime.

Platform archives, installers, signing, and notarization mechanics belong to the selected
maintained packager.

## Current implementation

The current implementation assembles Desktop Manager, the self-contained Application Runtime,
Dashboard, Workspace Service, and migrations into a deterministic staging tree and writes its
integrity manifest. Application Runtime can run the Workspace Service and Dashboard Host boundary
without Docker or a system Node.js installation.

The staging tree remains an engineering artifact because Browser Session packaging and the Desktop
Manager lifecycle protocol are incomplete. [Desktop
distribution](../../docs/desktop-distribution.md) tracks the remaining delivery stages and release
boundary.

Node.js executes the package's TypeScript entrypoints directly, with no generated JavaScript copy.
Vitest tests the assembly boundary, Cargo supplies structured Rust package metadata, and Node's
standard library supplies filesystem operations. Application Runtime uses Node.js
single-executable application support for the native runtime artifact.

## Commands

Build the application dependencies and assemble the current staging tree:

```sh
pnpm exec moon run desktop-distribution:assemble
```

The command writes
`target/desktop-distribution/<platform>-<architecture>/Job Boardwalk/`.

For engineering validation, `bin/job-boardwalk-runtime` starts Workspace Service and Dashboard
Host. Run it from an unrelated current working directory; it writes the database only to
`data/workspace.sqlite`. Stop it with `SIGINT` or `SIGTERM`. This does not make the staging tree a
supported product topology.

Run its direct checks:

```sh
pnpm exec moon run \
  desktop-distribution:lint \
  desktop-distribution:typecheck \
  desktop-distribution:test
```
