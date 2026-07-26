# Desktop distribution

This document is the source of truth for Job Boardwalk's installed form and desktop release
boundary. [Product design](product-design.md) owns cross-application behavior and control
boundaries; [Deployment](deployment.md) documents the supported Compose topology.

## Delivery status

The repository currently produces a deterministic desktop staging tree with a self-contained
Desktop Runtime. The runtime starts Workspace Service, Dashboard Host, and Browser Session as
isolated roles, waits for their loopback health endpoints, and shuts them down in reverse order. It
derives Dashboard, Browser Session, migrations, profile, logs, and workspace database paths from
the installed executable rather than from the current working directory or ambient configuration.

Desktop Manager owns the runtime child process through a generated, versioned, length-delimited
Protobuf protocol and exposes working start, stop, status, logs, and Dashboard controls. Browser
discovery reports whether it recognized a Chrome or Edge candidate, found one it could not inspect,
or found none. Workspace Service and Dashboard remain usable when Browser Session cannot start.

The manifest marks the tree `desktop-staging` and `releaseReady: false`. It is a runnable
engineering artifact, not a supported product topology; the final stage in
[Delivery sequence](#delivery-sequence) owns the remaining release criteria.

[Desktop Distribution](../internal/desktop-distribution/README.md) documents the staging command
and output. The supported topology remains the Docker Compose and graphical-host arrangement
documented in [Deployment](deployment.md).

## Installed product contract

The target release is installed by placing one complete `Job Boardwalk` directory in a
user-selected, writable location. The directory may be extracted from an archive, copied, placed
through drag-and-drop, or written by a thin installer. Running the installed product must not
require Docker, a system Node.js runtime, pnpm, Cargo, or a source checkout.

The installed product writes its runtime state only inside its product directory and requires no
system-wide registration. An optional operating-system integration, such as a shortcut, is a
separate explicit user action.

Uninstalling the target product consists of stopping Job Boardwalk and removing its directory.
Removing the directory also removes the workspace database and browser profile; preserve `data/`
in a backup when either must be retained.

## Product directory

Desktop Manager derives the product root from its executable or application-bundle location, not
from the launching process's current working directory. The target logical layout is:

```text
Job Boardwalk/
├── bin/
│   ├── job-boardwalk-desktop-manager
│   └── job-boardwalk-desktop-runtime
├── payload/
│   ├── dashboard/
│   ├── browser-session.cjs
│   ├── migrations/
│   ├── licenses/
│   └── workspace-service.mjs
├── data/
│   ├── browser-profile/
│   ├── logs/
│   └── workspace.sqlite
└── manifest.json
```

Platform packaging may wrap Desktop Manager in a signed application bundle or add executable
suffixes, but one writable outer product directory must contain the immutable resources and the
`data/` directory. Signed bundle contents remain immutable; runtime data is a sibling under the
outer product root, never a child of the signed bundle.

Packaged services receive absolute, product-root-derived paths. Source development may override
paths through environment variables, but an installed run cannot depend on ambient environment
variables or the current working directory.

## Runtime payload

The target release contains an application-specific runtime executable built from the Node.js
runtime, the process coordinator and Dashboard Host code, and their production dependencies. The
finalized Workspace Service module, Browser Session module, and Dashboard assets remain product
payload resources. Unused runtime components and dependencies are excluded; the product does not
ship a general-purpose Node.js distribution or `node_modules`.

The executable contains the Desktop Runtime process coordinator and role dispatch defined by
[Product design](product-design.md). It may start itself in distinct roles so process isolation
does not require duplicate runtime files. The Workspace Service role loads the finalized module
from the payload; Browser Session loads its finalized self-contained payload module; Dashboard Host
serves the built Dashboard and proxies `/api`, replacing Caddy in the directory-contained product.

Packaged service endpoints bind only to loopback. Their concrete addresses remain private runtime
details coordinated among product-owned components.

## System browser dependency

The target release does not bundle Chromium. Desktop Runtime discovers an installed Chrome or Edge
executable that reports a recognizable version and passes its absolute path to Browser Session,
which uses the dedicated profile under `data/browser-profile/`. It never launches the user's
normal browser profile.

Discovery recognizes a browser candidate; it does not establish compatibility with every system
browser build. Browser Session startup and health are the operational compatibility boundary; a
launch failure is reported as a service failure. Downloading or installing a browser is outside
the default product lifecycle.

[Product design](product-design.md) remains authoritative for Browser Session ownership, visible
browser behavior, user handoff, credentials, verification, applications, messages, and account
control.

## Integrity and release artifacts

Every assembled product tree contains a versioned manifest with the product version, target
platform and architecture, relative file paths, byte sizes, and SHA-256 digests. Paths use forward
slashes and remain sorted so identical inputs produce identical manifests.

Each release target must be built and tested on its native operating system. Release validation
must run the assembled directory outside the repository and from an unrelated current working
directory before platform signing or notarization. Portable archives are the primary artifacts. A
native installer is acceptable only when it preserves the same product-directory boundary.

An update stages and verifies replacement resources before switching them into place. It preserves
`data/`; partial in-place replacement is not a valid update path.

## Build ownership

Build responsibilities follow the boundary that owns each artifact:

| Owner                                                                               | Responsibility                                                                                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Application projects                                                                | Produce finalized native, service, and web artifacts.                                                                          |
| [`@job-boardwalk/desktop-product-layout`](../packages/desktop-product-layout/)      | Define the shared relative and resolved path contract for the directory-contained product.                                     |
| [`@job-boardwalk/desktop-distribution`](../internal/desktop-distribution/README.md) | Declare allowed components, assemble and validate the product tree, emit integrity metadata, and configure platform packaging. |
| Platform packager                                                                   | Produce archives, application bundles, and installers and integrate platform signing and notarization.                         |
| Moon                                                                                | Schedule the application builds, distribution work, and repository checks.                                                     |

Desktop Distribution runs only during development and release; packaged applications do not depend
on it. Platform packaging mechanics belong to the selected maintained packager rather than to
custom assembly code.

## Delivery sequence

1. **Staging boundary — implemented.** Assemble an explicit allowlist of finalized application
   artifacts into the deterministic product tree, then emit the integrity manifest. The staging
   tree contains no Docker files, browser binary, general-purpose Node.js distribution,
   `node_modules`, or source checkout.
2. **Self-contained runtime — implemented for the packaged service boundary.** Dashboard Host and
   the Desktop Runtime process coordinator run from the application-specific Node.js single
   executable. Workspace Service, Dashboard Host, and Browser Session consume product-root-derived
   resources and run without Docker, a system Node.js installation, `node_modules`, or a source
   checkout.
3. **Desktop lifecycle — implemented.** Desktop Runtime starts the Browser Session role only after
   recognizing a system-browser candidate and gives it the in-directory profile. The generated,
   bounded manager protocol drives working start, stop, status, logs, and Dashboard controls while
   Desktop Runtime retains child-process lifecycle coordination.
4. **Platform releases.** Add native smoke tests, portable archives, signing, notarization,
   provenance, licenses, backup, and atomic in-directory updates. The desktop release becomes the
   supported product topology when it covers the complete observable lifecycle.
