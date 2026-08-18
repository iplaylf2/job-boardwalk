# Desktop Distribution

Desktop Distribution is Job Boardwalk's private desktop-product build coordinator. It implements
the product-specific assembly and packaging boundary defined by
[Desktop distribution](../../docs/desktop-distribution.md).

## Responsibility

The package owns:

- selection and verification of third-party native inputs;
- assembly of the documented desktop-product layout;
- the explicit allowlist of installed components;
- the product-root readme shipped with an extracted desktop build;
- build-time validation that resources stay within the product directory contract;
- portable-archive naming and invocation of the native archive tool.

It consumes finalized application artifacts and does not own their construction or behavior,
runtime supervision, or browser automation. Release workflows separately own version gating,
attestations, and publication.

For Caddy, [`aqua.yaml`](aqua.yaml) selects the release and pins Aqua's standard registry. That
registry defines the native asset mapping and upstream verification policy; the checked-in
[`aqua-checksums.json`](aqua-checksums.json) records SHA-512 digests for the selected Linux and
Windows archives and a SHA-256 digest for the registry definition.

[Desktop distribution](../../docs/desktop-distribution.md) owns the installed layout and release
boundary; assembly tests and Desktop Manager tests independently verify their owned sides of that
contract.

## Outputs

The assemble command writes the product tree under
`target/desktop-distribution/<platform>-<architecture>/job-boardwalk/`. It copies the declared
components into the [documented product layout](../../docs/desktop-distribution.md#product-directory)
without interpreting application entry modules or dependency graphs.

On Linux or Windows, the package command writes one archive under
`target/desktop-distribution/releases/`. Its filename is
`job-boardwalk-<product-version>-<platform>-<architecture><extension>`. Windows uses the `windows`
platform token and `.zip` extension; Linux uses the `linux` platform token and `.tar.gz` extension.
Release automation consumes this filename contract. The staging tree and archives remain
engineering artifacts rather than the supported deployment topology.

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
the product Caddyfile; the assembler validates it before copying it.

For engineering validation, launch `./job-boardwalk` from the product root on Linux or
`job-boardwalk.exe` from the product root on Windows. Private Caddy and Node.js host executables
remain under `runtime/`; the Node.js runtime is embedded in the host rather than either service
payload. This does not make the staging tree a supported product topology.

With the prepared Caddy path still set, create the native portable archive on Linux or Windows:

```sh
pnpm exec moon run desktop-distribution:package
```

The command writes the native archive described in [Outputs](#outputs).

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
