# Development

This document defines Job Boardwalk's cross-language development model. Application and tooling
READMEs own component-specific commands and requirements; [Deployment](deployment.md) owns the
runtime topology and deployable artifacts.

## Workspace authorities

Each ecosystem retains its native dependency and workspace authority:

- `pnpm-workspace.yaml` defines the Node.js workspace and shared dependency requirements.
  Root `package.json` declares the Node.js and pnpm toolchain requirements used by development, CI,
  and source image builds. `pnpm-lock.yaml` records the exact dependency and toolchain resolutions.
- Root `Cargo.toml` defines the Rust workspace and compatible dependency requirements. `Cargo.lock`
  records the exact resolution.
- `rust-toolchain.toml` pins the Rust compiler and required components. The project does not
  currently publish a minimum-supported-Rust-version contract.

moon owns the cross-language project graph, task graph, affected-file selection, scheduling, and
task cache. It invokes Cargo and pnpm commands without replacing either dependency manager:

- [`.moon/toolchains.yml`](../.moon/toolchains.yml) pins the Cargo command-line tools that Moon
  provisions for repository tasks.
- `cargo-workspace` owns workspace-wide Rust tasks. Cargo commands run once for the workspace and
  share one mutex because the workspace has one lockfile and build directory.
- `repository` owns cross-ecosystem formatting, unused-code analysis, and dependency-boundary
  checks.
- Application, package, and tooling projects expose their existing package scripts as Moon tasks.

## Checks

Install the locked Node.js dependencies and the Rust toolchain declared in
[`rust-toolchain.toml`](../rust-toolchain.toml). Linux also requires the native build dependencies
listed by [Desktop Manager](../apps/desktop-manager/README.md). Run the local plan with:

```sh
pnpm install --frozen-lockfile
pnpm exec moon exec --plan .moon/check.json
```

The plan covers formatting, unused code, dependency boundaries, linting, type checking, tests, and
production builds across the pnpm and Cargo workspaces. Apply repository and Rust formatting with:

```sh
pnpm exec moon run repository:format-write cargo-workspace:format-write
```

Run the time-dependent Rust advisory check on demand with
`pnpm exec moon run cargo-workspace:advisories`. Moon provisions the repository-pinned cargo-deny
version when the task first needs it; no separate local installation is required.

Package scripts and Cargo commands remain valid leaf operations when Moon is unavailable or
inappropriate, including inside application Dockerfiles.

## Desktop distribution staging

Prepare the repository-pinned native inputs, then build the current application artifacts and
assemble the directory-contained staging tree:

```sh
pnpm --filter @job-boardwalk/desktop-distribution run prepare-release-inputs
export JOB_BOARDWALK_DESKTOP_CADDY_EXECUTABLE="$(aqua which --config internal/desktop-distribution/aqua.yaml caddy)"
pnpm exec moon run desktop-distribution:assemble
```

[Desktop Distribution](../internal/desktop-distribution/README.md) documents the output and direct
checks, the Aqua prerequisite, the PowerShell form, and the explicit override for testing another
Caddy build. The [desktop distribution specification](desktop-distribution.md) defines the
installed form, build ownership, and remaining delivery work.

On Linux or Windows, assemble and create the native portable archive with:

```sh
pnpm exec moon run desktop-distribution:package
```

The package task writes the portable archive under `target/desktop-distribution/releases/`.

## Continuous integration

### Merge checks

Non-draft pull requests targeting `master` run the [affected CI plan](../.moon/ci.json) on Ubuntu.
Changes that affect Desktop Manager receive one representative native build.

Merge checks reject Rust dependencies covered by RustSec security or soundness advisories. An
unmaintained dependency blocks a merge only when a workspace package depends on it directly. The
advisory result remains uncached because its database changes independently of the repository.

CI caches Cargo downloads and repository-pinned command-line tools. Rust compilation uses sccache
with GitHub Actions as its cache backend. The complete Cargo `target/` tree is excluded because it
also contains unrelated application staging artifacts. These caches accelerate work without
bypassing Cargo's dependency graph or moon's task graph.

To avoid compiling cargo-binstall during every merge check, the workflow downloads a prebuilt binary
for the version declared in [`.moon/toolchains.yml`](../.moon/toolchains.yml). Moon then provisions
the remaining Cargo tools from the same configuration.

Workflow actions use maintainer-published major release tags when available and exact release tags
otherwise. Installed project tools take their versions from the repository configuration that owns
them; CI-only setup helpers use their action's supported default unless the repository needs a
specific compatibility constraint. Desktop release runner versions are explicit so their image
migrations happen as reviewed repository changes.

### Desktop releases

Portable Linux and Windows distributions are built only for a Changesets-managed desktop release,
not for every pull request.

Record desktop release intent with `pnpm changeset` as described in the
[Changesets contributor guide](../.changeset/README.md). The current release unit is
`@job-boardwalk/desktop-distribution`; its package version supplies the product manifest, archive
names, tag, and GitHub release. Other workspaces are not versioned independently.

One release workflow follows the Changesets custom-publishing model. A `master` push with pending
changesets creates or updates the version pull request. Merging that pull request changes the
product version and removes the consumed changesets, which opens the Linux and Windows packaging
matrix. Each matrix row owns only its native runner and expected product archive path. Desktop
Distribution's [Aqua configuration](../internal/desktop-distribution/aqua.yaml) selects Caddy and
pins the registry that maps each runner to its native asset. The checked-in
[checksum file](../internal/desktop-distribution/aqua-checksums.json) records the SHA-512 digest for
both assets. Aqua installs and verifies the selected archive, and the workflow passes its resolved
executable path into the Moon package graph. Because the version detector has already decided that
packaging is required, the release command bypasses Moon's general-purpose CI affected checks.
After both jobs pass, the workflow creates a separate `SHA256SUMS` for the completed Job Boardwalk
archives and publishes them as a `v<version>` GitHub prerelease using the Changesets changelog.

If packaging or publication fails after a version commit, rerun the repaired workflow manually
from `master` with that existing desktop version. The workflow rejects a retry whose requested
version does not match the current Desktop Distribution manifest, and it does not replace an
existing non-draft release.

The repository setting that permits Actions to create pull requests must be enabled. Configure
`CHANGESETS_GITHUB_TOKEN` with a GitHub App or fine-grained token when version pull requests must
trigger other workflows automatically; the built-in token remains the fallback.

The GitHub prerelease remains an engineering artifact. The
[desktop delivery sequence](desktop-distribution.md#delivery-sequence) owns the work required to
promote it to a supported release channel.

## Generated artifacts and language boundaries

Rust output stays under the root `target/` directory. Node.js applications produce their own
compiled output, which is never imported as source across the language boundary. Each application
owns its stable entrypoint, runtime resources, and finalized artifact. Runtime integrations consume
those public artifacts without reconstructing their dependency contents. The application READMEs
document their different finalization strategies: Workspace Service uses its Vite output directly,
while Browser Session adds a pnpm-produced production dependency closure.

Future Rust applications join the root Cargo workspace. Arguments, health endpoints, exit status,
logs, and process signals are sufficient for the current cross-language lifecycle and need no
generated schema. If a future protocol requires structured data across languages, it must have one
language-neutral source, standard generators, generated consumers, and a drift check. A
runtime-specific supervisor adapts its shutdown mechanism at its process-host boundary.
Neither ecosystem imports the other ecosystem's implementation files.
