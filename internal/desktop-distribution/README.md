# Desktop Distribution

Desktop Distribution is Job Boardwalk's private desktop-product build coordinator. It implements
the product-specific assembly and packaging boundary defined by
[Desktop distribution](../../docs/desktop-distribution.md).

## Responsibility

The package owns:

- the directory-contained product layout and integrity manifest;
- the explicit allowlist of application-owned build artifacts;
- build-time validation that resources stay within the product directory contract;
- platform-packager configuration and invocation;
- signing, notarization, provenance, and release-input policy.

It consumes finalized application artifacts. It does not own their construction or behavior,
runtime supervision, browser automation, update behavior, or release-channel decisions.

Platform archives, installers, signing, and notarization mechanics belong to the selected
maintained packager.

## Current implementation

The current implementation assembles the application build outputs into a deterministic staging
tree and writes its integrity manifest. The staging tree validates the assembly boundary but is not
yet a runnable release.

Node.js executes the package's TypeScript entrypoints directly, with no generated JavaScript copy.
Vitest tests the assembly boundary, Cargo supplies structured Rust package metadata, and Node's
standard library supplies filesystem operations.

## Commands

Build the application dependencies and assemble the current staging tree:

```sh
pnpm exec moon run desktop-distribution:assemble
```

The command writes
`target/desktop-distribution/<platform>-<architecture>/Job Boardwalk/`.

Run its direct checks:

```sh
pnpm exec moon run \
  desktop-distribution:lint \
  desktop-distribution:typecheck \
  desktop-distribution:test
```
