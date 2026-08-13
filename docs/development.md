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

Package scripts and Cargo commands remain valid leaf operations when Moon is unavailable or
inappropriate, including inside application Dockerfiles.

## Desktop distribution staging

Build the current application artifacts and assemble the directory-contained staging tree with:

```sh
JOB_BOARDWALK_DESKTOP_CADDY_EXECUTABLE=/absolute/path/to/caddy \
  pnpm exec moon run desktop-distribution:assemble
```

[Desktop Distribution](../internal/desktop-distribution/README.md) documents the output and direct
checks, including the PowerShell form of the commands. The explicit build input supplies the
platform-native Caddy executable used by Dashboard. The
[desktop distribution specification](desktop-distribution.md) defines the installed form, build
ownership, and remaining delivery work.

On Linux or Windows, assemble and create the native portable archive with:

```sh
JOB_BOARDWALK_DESKTOP_CADDY_EXECUTABLE=/absolute/path/to/caddy \
  pnpm exec moon run desktop-distribution:package
```

The package task writes the portable archive under `target/desktop-distribution/releases/`.

## Continuous integration

Non-draft pull requests targeting `master` run the affected CI plan on Ubuntu. A change that affects
Desktop Manager receives one representative native build. Portable Linux and Windows distributions
are built only for a Changesets-managed desktop release, not for every pull request.

Workflow actions use verified published release tags. Desktop release runner versions are explicit
so their image migrations happen as reviewed repository changes.

Record desktop release intent with `pnpm changeset` as described in the
[Changesets contributor guide](../.changeset/README.md). The current release unit is
`@job-boardwalk/desktop-distribution`; its package version supplies the product manifest, archive
names, tag, and GitHub release. Other workspaces are not versioned independently.

One release workflow follows the Changesets custom-publishing model. A `master` push with pending
changesets creates or updates the version pull request. Merging that pull request changes the
product version and removes the consumed changesets, which opens the Linux and Windows packaging
matrix. Each native job verifies its pinned Caddy input, builds the portable archive, and records
provenance for that archive. After both jobs pass, the workflow creates `SHA256SUMS` and publishes
both archives as a `v<version>` GitHub prerelease using the Changesets changelog.

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
