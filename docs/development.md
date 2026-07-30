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
checks. The assembled Desktop Service Host is a Node.js single executable that loads Workspace
Service or Browser Session without a system Node.js installation or `node_modules`. The explicit
build input supplies the platform-native Caddy executable used by Dashboard.
[Desktop distribution](desktop-distribution.md) defines the installed form, build ownership, and
remaining delivery work.

On Linux or Windows, assemble and create the native portable archive with:

```sh
JOB_BOARDWALK_DESKTOP_CADDY_EXECUTABLE=/absolute/path/to/caddy \
  pnpm exec moon run desktop-distribution:package
```

The package task writes the portable archive under `target/desktop-distribution/releases/`.

## Continuous integration

Non-draft pull requests targeting `master` run the affected CI plan on Ubuntu. A change that affects
Desktop Manager receives one representative native build. The pull-request workflow does not build
portable archives. Platform-specific jobs belong in the future publication workflow that produces
those artifacts and validates their packaging, signing, or operating-system behavior.

## Generated artifacts and language boundaries

Rust output stays under the root `target/` directory. Node.js applications produce their own
`dist/` artifacts, which are never imported as source across the language boundary.

Future Rust applications join the root Cargo workspace. Arguments, health endpoints, exit status,
logs, and process signals are sufficient for the current cross-language lifecycle and need no
generated schema. If a future protocol requires structured data across languages, it must have one
language-neutral source, standard generators, generated consumers, and a drift check. A
runtime-specific supervisor adapts its shutdown mechanism at its process-host boundary.
Neither ecosystem imports the other ecosystem's implementation files.
