# Desktop distribution

This document is the source of truth for Job Boardwalk's installed form and desktop release
boundary. [Product design](product-design.md) owns cross-application behavior and control
boundaries; [Deployment](deployment.md) documents the supported Compose topology.

## Delivery status

The repository currently assembles a deterministic, runnable staging tree inside the documented
product-directory boundary. It includes the service host, packaged Caddy boundary, and direct
process supervision described below. Desktop Manager exposes working lifecycle and status controls
alongside the Dashboard address and service log path. A missing browser leaves Workspace Service
and Dashboard available and puts the desktop application in a limited state.

The manifest identifies this artifact as `desktop-staging` with `releaseReady: false`. The archive
command packages that tree as a Linux `.tar.gz` or Windows `.zip` on the corresponding native
platform. Publication, signing, license collection, backup, and atomic updates remain outstanding
in [Delivery sequence](#delivery-sequence). [Deployment](deployment.md) therefore remains the
supported topology.
[Desktop Distribution](../internal/desktop-distribution/README.md) documents how to build and
inspect the staging tree.

## Installed product contract

The target release is installed by placing one complete `job-boardwalk` directory in a
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
job-boardwalk/
├── job-boardwalk
├── runtime/
│   ├── node-service-host
│   └── caddy
├── payload/
│   ├── caddyfile
│   ├── dashboard/
│   ├── browser-session/
│   │   ├── package.json
│   │   ├── dist/
│   │   │   └── index.cjs
│   │   └── node_modules/
│   ├── licenses/
│   └── workspace-service/
│       ├── index.mjs
│       └── migrations/
├── data/
│   ├── browser-profile/
│   ├── caddy/
│   ├── logs/
│   ├── settings.json       # created after settings are first saved
│   └── workspace.sqlite
└── manifest.json
```

Windows adds `.exe` to the root `job-boardwalk` entrypoint and the private runtime executables.
Platform packaging may wrap Desktop Manager in a signed application bundle, but one writable outer
product directory must contain the immutable resources and the `data/` directory. Signed bundle
contents remain immutable; runtime data is a sibling under the outer product root, never a child of
the signed bundle.

Distribution-owned path segments use lowercase kebab-case. Finalized application payloads retain
the entrypoint, package metadata, dependency, and migration names defined by their owning build
tools and runtime contracts; Desktop Distribution does not rename contents such as `package.json`,
`index.cjs`, or package-manager-owned dependency files.

Packaged services receive absolute, product-root-derived paths. Source development may override
paths through environment variables, but an installed run cannot depend on ambient environment
variables or the current working directory.

## Runtime payload

The root `job-boardwalk` executable is the only user-facing launch surface. Private executable
dependencies live under `runtime/`; application code and static resources live under `payload/`.

The target release contains `runtime/node-service-host`, an application-specific service-host
executable built with Node.js single-executable application support and a small role dispatcher.
Its name reflects that restricted role: the executable accepts only product-owned roles and
explicit service entrypoints and is not a general Node.js command. The Node.js runtime is embedded
in that shared executable; it is not installed under either service payload, and the product does
not contain a standalone `node` command. Finalized Workspace Service and Browser Session artifacts
remain application-owned under the product payload.
Workspace Service exposes `index.mjs`; Browser Session is a pnpm-produced portable application
package exposing `dist/index.cjs`. Desktop Manager resolves those entrypoints from the installed
product layout. Desktop Distribution places each complete artifact without selecting or relocating
individual dependencies. Browser Session therefore retains Patchright's published package layout.
The product does not ship a general-purpose Node.js distribution, package manager, development
dependency tree, or source workspace.

Desktop Manager invokes the host in one explicit role for each isolated Node service process. The
host loads the selected entry module directly. It does not derive layout paths, inspect service
contents, discover browsers, or coordinate sibling processes. Desktop Manager resolves the
configured browser override or a common system Chrome, Edge, or Chromium installation and passes
the exact path to Browser Session. Dashboard instead runs on the packaged Caddy executable.
Compose and desktop distribution share the same Caddyfile, so static serving, security headers, SPA
fallback, compression, and `/api` proxying have one configuration and one maintained server
implementation.

Packaged service endpoints bind only to loopback. Their concrete addresses remain private runtime
details coordinated among product-owned components. Desktop Manager Settings owns the three
product endpoint ports and persists them in `data/settings.json`; all ports must be non-zero and
distinct. Settings also accepts an optional absolute browser executable override. Product
payload, executable, database, profile, log, and lifecycle-control paths continue to derive from
the product directory and cannot be redirected through user settings.

Desktop Manager starts Caddy with a private loopback admin endpoint selected for that process at
startup and uses it as the single cross-platform graceful-shutdown contract. That endpoint exists
only in Manager's in-memory lifecycle state and is neither a product endpoint nor a persisted
setting. Shutdown retains a bounded wait and forced-exit fallback.

## Browser runtime dependency

The desktop product does not bundle or download a browser. When no executable override is selected
in Desktop Manager Settings, Manager checks the platform's common Chrome, Edge, and Chromium
locations. When an absolute path is selected, it checks only that executable. Engineering staging
may provide an explicit development override through `JOB_BOARDWALK_BROWSER_EXECUTABLE_PATH`; the
Patchright development cache is not a product discovery source. A candidate must report a
recognizable version before Manager passes its absolute path to Browser Session, which uses the
dedicated profile under `data/browser-profile/`. It never launches the user's normal browser
profile.

Discovery recognizes a browser candidate; it does not establish compatibility with every system
browser build. Browser Session owns browser launch, runtime compatibility, and recovery. Discovery
failure prevents only the browser process from starting; Desktop Manager keeps Workspace Service
and Dashboard running and presents an actionable limited state. If the Browser Session process
exits, Manager reports the failure and points to the service log. The desktop product never
downloads or installs browser software.

[Product design](product-design.md) remains authoritative for Browser Session ownership, visible
browser behavior, user handoff, credentials, verification, applications, messages, and account
control.

## Integrity and release artifacts

Every assembled product tree contains a versioned manifest with the product version, target
platform and architecture, relative file paths, byte sizes, and SHA-256 digests. Paths use forward
slashes and remain sorted so identical inputs produce identical manifests. Finalized application
artifacts may contain package-manager-owned relative symbolic links. Assembly materializes them
into regular installed files so the manifest accounts for every installed byte without depending
on link resolution or archive-specific link behavior.

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
| Application projects                                                                | Produce finalized native, Node service, and web artifacts.                                                                                            |
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
   tree contains no Docker files, browser binary, general-purpose Node.js distribution, package
   manager, development dependency tree, or source checkout.
2. **Self-contained service host — implemented.** The application-specific Node.js single
   executable is shared by isolated Node service processes and loads one finalized payload per
   invocation. Workspace Service and Browser Session consume product-root-derived resources and run
   without Docker, a system Node.js installation, or a source checkout. Browser Session owns its
   production dependency closure; packaged Caddy owns Dashboard HTTP.
3. **Desktop lifecycle — implemented.** Desktop Manager directly starts, checks, observes, and
   stops the isolated services. Manager recognizes a configured or system-browser candidate, and
   Browser Session receives its exact path and the in-directory profile; browser failure degrades
   that capability without taking the workspace or Dashboard offline.
4. **Linux and Windows archive construction — implemented.** On the target operating system, emit
   the assembled product as a `.tar.gz` or `.zip`.
5. **Native release publication.** When release inputs and channels are settled, build and validate
   artifacts in a publication-triggered Linux and Windows workflow. Add Windows signing, release
   provenance, license collection, backup, and atomic in-directory updates. Add Linux signing when
   the selected publication channel defines its trust mechanism. The desktop release becomes the
   supported product topology when it covers the complete observable lifecycle.
