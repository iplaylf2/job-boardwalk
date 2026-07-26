# Desktop distribution

This document is the source of truth for Job Boardwalk's installed form and desktop release
boundary. [Product design](product-design.md) owns cross-application behavior and control
boundaries; [Deployment](deployment.md) documents the supported Compose topology.

## Delivery status

The repository currently assembles a deterministic, runnable staging tree inside the documented
product-directory boundary. It includes the service host, packaged Caddy boundary, and direct
process supervision described below. Desktop Manager exposes working lifecycle, status, log, and
Dashboard controls; Browser Session failure leaves Workspace Service and Dashboard available.

The manifest identifies this artifact as `desktop-staging` with `releaseReady: false`. The archive
command packages that tree as a Linux `.tar.gz` or Windows `.zip` on the corresponding native
platform. The Windows path has not yet been validated on Windows; publication, signing, license
collection, backup, and atomic updates also remain outstanding in
[Delivery sequence](#delivery-sequence). [Deployment](deployment.md) therefore remains the
supported topology.
[Desktop Distribution](../internal/desktop-distribution/README.md) documents how to build and
inspect the staging tree.

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
│   ├── job-boardwalk-desktop-service-host
│   └── caddy
├── payload/
│   ├── Caddyfile
│   ├── dashboard/
│   ├── browser-session.cjs
│   ├── migrations/
│   ├── licenses/
│   └── workspace-service.mjs
├── data/
│   ├── browser-profile/
│   ├── caddy/
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

The target release contains an application-specific service-host executable built with Node.js
single-executable application support and a small role dispatcher. Finalized Workspace Service and
Browser Session modules remain product payload resources. The product does not ship a
general-purpose Node.js distribution or `node_modules`.

Desktop Manager invokes the host in one explicit role for each isolated Node service process. The
host loads the selected finalized module and, for Browser Session, discovers a system Chrome or
Edge candidate with a recognizable version. It does not derive layout paths or coordinate sibling
processes. Dashboard instead runs on the packaged Caddy executable. Compose and desktop
distribution share the same Caddyfile, so static serving, security headers, SPA fallback,
compression, and `/api` proxying have one configuration and one maintained server implementation.

Packaged service endpoints bind only to loopback. Their concrete addresses remain private runtime
details coordinated among product-owned components.

## System browser dependency

The target release does not bundle Chromium. Desktop Service Host's Browser Session invocation
discovers an installed Chrome or Edge executable that reports a recognizable version and passes
its absolute path to Browser Session, which uses the dedicated profile under
`data/browser-profile/`. It never launches the user's normal browser profile.

Discovery recognizes a browser candidate; it does not establish compatibility with every system
browser build. Browser Session's runtime status is the operational compatibility boundary; a launch
failure remains visible through Dashboard and the service log while Browser Session continues its
recovery loop. Downloading or installing a browser is outside the default product lifecycle.

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

| Owner                                                                               | Responsibility                                                                                                                                        |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application projects                                                                | Produce finalized native, service, and web artifacts.                                                                                                 |
| Desktop Manager                                                                     | Resolve installed paths and own the desktop process topology.                                                                                         |
| [`@job-boardwalk/desktop-distribution`](../internal/desktop-distribution/README.md) | Declare allowed components, enforce the product-directory boundary, assemble the product tree, emit its manifest, and invoke the native archive tool. |
| Platform packager                                                                   | Implement archive, application-bundle, installer, signing, and notarization mechanics for its platform.                                               |
| Moon                                                                                | Schedule the application builds, distribution work, and repository checks.                                                                            |

Desktop Distribution runs only during development and release; packaged applications do not depend
on it. Platform packaging mechanics belong to the selected maintained packager rather than to
custom assembly code.

The desktop build receives an absolute `JOB_BOARDWALK_DESKTOP_CADDY_EXECUTABLE` path. The assembler
verifies that the platform-native binary can load the product Caddyfile and records the copied bytes
in the product manifest. Release automation separately owns version selection, checksum,
provenance, and license policy. The installed product does not use a host Caddy installation.

## Delivery sequence

1. **Staging boundary — implemented.** Assemble an explicit allowlist of finalized application
   artifacts into the deterministic product tree, then emit the integrity manifest. The staging
   tree contains no Docker files, browser binary, general-purpose Node.js distribution,
   `node_modules`, or source checkout.
2. **Self-contained service host — implemented.** The application-specific Node.js single
   executable loads one finalized Node service payload per invocation. Workspace Service and
   Browser Session consume product-root-derived resources and run without Docker, a system Node.js
   installation, `node_modules`, or a source checkout; packaged Caddy owns Dashboard HTTP.
3. **Desktop lifecycle — implemented.** Desktop Manager directly starts, checks, observes, and
   stops the isolated services. The Browser Session role recognizes a system-browser candidate and
   receives the in-directory profile; its failure degrades browser capability without taking the
   workspace or Dashboard offline.
4. **Linux and Windows archive construction — implemented.** On the target operating system, emit
   the assembled product as a `.tar.gz` or `.zip`.
5. **Native release publication.** When release inputs and channels are settled, build and validate
   artifacts in a publication-triggered Linux and Windows workflow. Add Windows signing, release
   provenance, license collection, backup, and atomic in-directory updates. Add Linux signing when
   the selected publication channel defines its trust mechanism. The desktop release becomes the
   supported product topology when it covers the complete observable lifecycle.
