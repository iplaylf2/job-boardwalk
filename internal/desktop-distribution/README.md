# Desktop Distribution

Desktop Distribution is Job Boardwalk's private desktop-product build coordinator. It implements
the product-specific assembly and packaging boundary defined by
[Desktop distribution](../../docs/desktop-distribution.md).

## Responsibility

The package owns:

- assembly of the shared desktop-product layout and its integrity manifest;
- the explicit allowlist of application-owned build artifacts;
- build-time validation that resources stay within the product directory contract;
- future platform-packager configuration and invocation;
- release-input, signing, notarization, and provenance policy.

It consumes finalized application artifacts. It does not own their construction or behavior,
runtime supervision, browser automation, update behavior, or release-channel decisions.
[`@job-boardwalk/desktop-product-layout`](../../packages/desktop-product-layout/) owns the path
contract consumed by both this assembler and Desktop Runtime.

Desktop Distribution will configure and invoke a maintained platform packager; archive, installer,
signing, and notarization mechanics remain inside that packager.

## Current implementation

The current implementation assembles Desktop Manager, Desktop Runtime, Browser Session, Dashboard,
Workspace Service, and migrations into a deterministic staging tree and writes its integrity
manifest. The staged lifecycle runs without Docker, a system Node.js installation, `node_modules`,
or a bundled browser.

The staging tree remains an engineering artifact.
[Desktop distribution](../../docs/desktop-distribution.md) owns the installed-form contract,
release readiness criteria, and remaining delivery work.

Node.js executes the package's TypeScript entrypoints directly, with no generated JavaScript copy.
Vitest tests the assembly boundary, Cargo supplies structured Rust package metadata, and Node's
standard library supplies filesystem operations. Desktop Runtime uses Node.js
single-executable application support for the native runtime artifact.

## Commands

Build the application dependencies and assemble the current staging tree:

```sh
pnpm exec moon run desktop-distribution:assemble
```

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
