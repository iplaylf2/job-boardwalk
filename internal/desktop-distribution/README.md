# Desktop Distribution

Desktop Distribution is Job Boardwalk's private desktop-product build coordinator. It implements
the product-specific assembly and packaging boundary defined by
[Desktop distribution](../../docs/desktop-distribution.md).

## Responsibility

The package owns:

- assembly of the documented desktop-product layout and its integrity manifest;
- the explicit allowlist of installed components;
- the product-root readme shipped with an extracted desktop build;
- build-time validation that resources stay within the product directory contract;
- selection and invocation of the native archive tool.

It consumes finalized application artifacts. It does not own their construction or behavior,
runtime supervision, browser automation, update behavior, release version selection, release-file
checksums, signing credentials, provenance, license policy, or release-channel decisions.
[Desktop distribution](../../docs/desktop-distribution.md) owns the installed layout and release
boundary; assembly tests and Desktop Manager tests independently verify their owned sides of that
contract.

## Current implementation

The current implementation assembles a product-root user readme alongside Desktop Manager, a
private shared Node.js service host, a build-supplied Caddy executable, Browser Session, Dashboard,
and Workspace Service. It writes the result as a deterministic staging tree with an integrity
manifest. The staged lifecycle runs without Docker or a system installation of Node.js or Caddy.
It also requires no source checkout or bundled browser. Both Node services arrive as finalized
runtime directories; Desktop Distribution does not interpret their entry modules or dependency
graphs. Desktop Manager uses an installed system browser or an explicit executable override as
defined by the product contract.

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

In PowerShell on Windows, set the build input and run the same task with:

```powershell
$env:JOB_BOARDWALK_DESKTOP_CADDY_EXECUTABLE = "C:\absolute\path\to\caddy.exe"
pnpm exec moon run desktop-distribution:assemble
```

The input must be a platform-native Caddy executable that can load the product Caddyfile. The
assembler verifies that compatibility before copying it.

The command writes the product tree to
`target/desktop-distribution/<platform>-<architecture>/job-boardwalk/`.

For engineering validation, launch `./job-boardwalk` from the product root on Linux or
`job-boardwalk.exe` from the product root on Windows. Private Caddy and Node.js host executables
remain under `runtime/`; the Node.js runtime is embedded in the host rather than either service
payload. This does not make the staging tree a supported product topology.

Create the native portable archive on Linux or Windows:

```sh
JOB_BOARDWALK_DESKTOP_CADDY_EXECUTABLE=/absolute/path/to/caddy \
  pnpm exec moon run desktop-distribution:package
```

On Windows, use the PowerShell environment-variable assignment shown above, then run
`pnpm exec moon run desktop-distribution:package`.

The command writes a Linux `.tar.gz` or Windows `.zip` under
`target/desktop-distribution/releases/`.

Run its direct checks:

```sh
pnpm exec moon run \
  desktop-distribution:lint \
  desktop-distribution:typecheck \
  desktop-distribution:test
```
