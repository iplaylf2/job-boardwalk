# Desktop Distribution

Desktop Distribution is Job Boardwalk's private desktop-product build coordinator. It implements
the product-specific assembly and packaging boundary defined by
[Desktop distribution](../../docs/desktop-distribution.md).

## Responsibility

The package owns:

- selection and verification of third-party native inputs;
- assembly of the documented desktop-product layout and its integrity manifest;
- the explicit allowlist of installed components;
- the product-root readme shipped with an extracted desktop build;
- build-time validation that resources stay within the product directory contract;
- portable-archive naming and invocation of the native archive tool.

It consumes finalized application artifacts and does not own their construction or behavior,
runtime supervision, browser automation, or update behavior. Release workflows separately own
maintenance of the version pull request, release gating, the `SHA256SUMS` published for completed
Job Boardwalk archives, attestations, signing credentials, license policy, and release-channel
decisions.

For Caddy, [`aqua.yaml`](aqua.yaml) selects the release and pins Aqua's standard registry. That
registry defines the native asset mapping and upstream verification policy; the checked-in
[`aqua-checksums.json`](aqua-checksums.json) records SHA-512 digests for the selected Linux and
Windows archives and a SHA-256 digest for the registry definition. These input digests are distinct
from the release checksums published for completed Job Boardwalk archives.

[Desktop distribution](../../docs/desktop-distribution.md) owns the installed layout and release
boundary; assembly tests and Desktop Manager tests independently verify their owned sides of that
contract.

## Current implementation

The current implementation assembles a product-root user readme alongside Desktop Manager, the
private Desktop Service Host, a build-supplied Caddy executable, Browser Session, Dashboard, and
Workspace Service. It writes the result as a deterministic staging tree with an integrity manifest.
The staged lifecycle runs without Docker, a system installation of Node.js or Caddy, a source
checkout, or a bundled browser. Both Node services arrive as finalized runtime directories;
Desktop Distribution does not interpret their entry modules or dependency graphs. Desktop Manager
uses an installed system browser or an explicit executable override as defined by the product
contract.

On native Linux or Windows, the package task creates a portable archive from the assembled product.
The staging tree and unsigned prerelease archives remain engineering artifacts rather than the
supported deployment topology.

Node.js executes the package's TypeScript entrypoints directly, with no generated JavaScript copy.
Vitest tests the assembly and archive-coordination boundaries. This package's version is the
desktop product version recorded in the manifest and portable archive filenames; Changesets manages
its release increments and changelog. Node's standard library coordinates filesystem and process
work around the native archive tools.

## Portable archive contract

Each package invocation writes one archive for the current native target under
`target/desktop-distribution/releases/`. Its filename is
`job-boardwalk-<product-version>-<platform>-<architecture><extension>`. Windows uses the `windows`
platform token and `.zip` extension; Linux uses the `linux` platform token and `.tar.gz` extension.
The complete filename is the package-owned handoff contract consumed by release automation.

## Commands

Run these commands from the repository root. For a release-equivalent build, install
[Aqua](https://aquaproj.github.io/), then install and verify the repository-pinned native input:

```sh
pnpm --filter @job-boardwalk/desktop-distribution run prepare-release-inputs
```

Expose the installed Caddy path to the build tasks. In a POSIX shell, run:

```sh
export JOB_BOARDWALK_DESKTOP_CADDY_EXECUTABLE="$(aqua which --config internal/desktop-distribution/aqua.yaml caddy)"
```

In PowerShell, run:

```powershell
$env:JOB_BOARDWALK_DESKTOP_CADDY_EXECUTABLE = aqua which --config internal/desktop-distribution/aqua.yaml caddy
```

The preparation command installs the native Caddy archive selected by `aqua.yaml` and verifies it
against the platform's checked-in SHA-512 digest.

Build the application dependencies and assemble the current staging tree:

```sh
pnpm exec moon run desktop-distribution:assemble
```

To test another Caddy build, set `JOB_BOARDWALK_DESKTOP_CADDY_EXECUTABLE` to its absolute path
instead of the path returned by Aqua. The input must be a platform-native executable that can load
the product Caddyfile; the assembler verifies that compatibility before copying it.

The command writes the product tree to
`target/desktop-distribution/<platform>-<architecture>/job-boardwalk/`.

For engineering validation, launch `./job-boardwalk` from the product root on Linux or
`job-boardwalk.exe` from the product root on Windows. Private Caddy and Node.js host executables
remain under `runtime/`; the Node.js runtime is embedded in the host rather than either service
payload. This does not make the staging tree a supported product topology.

With the prepared Caddy path still set, create the native portable archive on Linux or Windows:

```sh
pnpm exec moon run desktop-distribution:package
```

The command writes the native archive described in
[Portable archive contract](#portable-archive-contract).

When updating the desktop Caddy version, edit `aqua.yaml`, regenerate all configured checksums, and
review both files together:

```sh
aqua update-checksum --config internal/desktop-distribution/aqua.yaml --prune
```

Caddy asset naming, platform selection, download, verification, and extraction remain Aqua
responsibilities rather than project code. The release workflow provisions its pinned Aqua
version, invokes the same package-owned preparation boundary, and passes the resolved Caddy path to
Moon.

Run its direct checks:

```sh
pnpm exec moon run \
  desktop-distribution:lint \
  desktop-distribution:typecheck \
  desktop-distribution:test
```
