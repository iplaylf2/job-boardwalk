# Desktop distribution

This document is the source of truth for Job Boardwalk's directory-contained desktop form and
prerelease boundary. [Product design](product-design.md) owns cross-application behavior and
control boundaries; [Deployment](deployment.md) documents the supported Compose topology.

## Delivery status

The repository publishes runnable Linux x64 and Windows x64 archives as GitHub prereleases. Desktop
Manager starts and observes the local services; an unavailable browser leaves Workspace Service
and Dashboard running while the application reports a limited state. These builds remain
evaluation artifacts, so [Deployment](deployment.md) is the supported topology.

[Desktop Distribution](../internal/desktop-distribution/README.md) documents how to build and
inspect the staging tree.

## Use a desktop prerelease

Each desktop prerelease on [GitHub Releases](https://github.com/iplaylf2/job-boardwalk/releases)
provides a Linux x64 `.tar.gz` and a Windows x64 `.zip`. Download the archive for the current
operating system and extract the complete `job-boardwalk` directory to a user-selected, writable
location. Do not run the application from inside the archive or separate files from the extracted
directory.

On Linux, run `./job-boardwalk` from the extracted directory. On Windows, run
`job-boardwalk.exe`. Desktop Manager starts and stops the local services and displays the Dashboard
address and service log path. Job Boardwalk uses an installed Chrome, Edge, or Chromium browser; if
automatic discovery fails while the services are stopped, select the browser executable in
Settings.

Patchright includes `--disable-blink-features=AutomationControlled` in the dedicated browser's launch
configuration. Edge may warn that this switch is unsupported. This is expected and does not by
itself indicate a Browser Session failure. Job Boardwalk leaves the warning visible and keeps the
browser process sandbox enabled.

These archives are unsigned prerelease builds. The operating system may warn before opening them,
and they are not the supported deployment topology. They do not provide automatic updates or a
supported backup or restore workflow. Keep each build in its own product directory, stop Job
Boardwalk before copying `data/` as a precautionary backup, and do not move that data into another
version. Removing the product directory also removes its workspace database, dedicated browser
profile, settings, and logs.

## Portable product contract

The portable product consists of one complete `job-boardwalk` directory in a user-selected,
writable location. Running it does not require Docker, a system Node.js runtime, pnpm, Cargo, or a
source checkout.

The product writes its runtime state only inside that directory and requires no system-wide
registration.

Uninstalling the portable product consists of stopping Job Boardwalk and removing its directory.
Removing the directory also removes the workspace database and browser profile; preserve `data/`
in a backup when either must be retained.

## Product directory

Desktop Manager derives the product root from its executable location, not from the launching
process's current working directory. The product layout is:

```text
job-boardwalk/
├── job-boardwalk
├── readme.md
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
│   └── workspace-service/
│       ├── index.mjs
│       └── migrations/
├── data/
│   ├── browser-profile/
│   ├── caddy/
│   ├── logs/
│   ├── settings.json       # created after settings are first saved
│   └── workspace.sqlite
```

The assembler creates `data/` as an empty writable boundary. Desktop Manager and its services
create the listed children when they are first needed.

Windows adds `.exe` to the root `job-boardwalk` entrypoint and the private runtime executables.

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

The portable product contains `runtime/node-service-host`, an application-specific service-host
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
host loads the selected entry module directly and waits for its exported `serviceCompletion`
promise. When that promise settles, the host releases its standard-input adapter and exits, so
Manager observes both normal completion and failure through the child process status. The host does
not derive layout paths, inspect service contents, discover browsers, or coordinate sibling
processes.

Manager retains the child's standard input as its shutdown channel. Closing that channel produces
EOF in the host, which dispatches the Node.js process's `SIGTERM` event so the loaded service
performs its ordinary resource cleanup on every platform. Forced termination remains a bounded
fallback owned by Manager.

Desktop Manager resolves the configured browser override or a common system Chrome, Edge, or
Chromium installation and passes the resulting browser launch selection to Browser Session.
Dashboard instead runs on the packaged Caddy executable.

On Windows, Manager starts all private service processes without console windows; the Manager GUI
and `data/logs/services.log` remain their user-facing status and diagnostic surfaces.

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
Patchright development cache is not a product discovery source. Manager passes the first existing
candidate to Browser Session. An automatically detected Chrome or Edge uses Playwright's `chrome`
or `msedge` browser channel; system Chromium and explicit overrides use their exact paths. Browser
Session owns launch and compatibility checks and uses the dedicated profile under
`data/browser-profile/`. It never launches the user's normal browser profile.

Discovery recognizes a browser candidate; it does not establish compatibility with every system
browser build. Browser Session owns browser launch, runtime compatibility, and recovery. Manager
does not mark browser access available until Browser Session reports a launch-ready browser. A
failure to discover or launch a compatible browser leaves Workspace Service and Dashboard running
and produces an actionable limited state. If the Browser Session process exits, Manager reports the
failure and points to the service log. The desktop product never downloads or installs browser
software.

[Product design](product-design.md) remains authoritative for Browser Session ownership, visible
browser behavior, user handoff, credentials, verification, applications, messages, and account
control.

## Release artifacts

Finalized application artifacts may contain package-manager-owned relative symbolic links.
Assembly materializes them into regular installed files so the installed tree does not depend on
link resolution or archive-specific link behavior.

Each release target must be built on its native operating system. Portable archives are the primary
artifacts.

## Build ownership

Build responsibilities follow the boundary that owns each artifact:

| Owner                                                                               | Responsibility                                                                           |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Application projects                                                                | Produce finalized native, Node service, and web artifacts.                               |
| Desktop Manager                                                                     | Resolve installed paths and own the desktop process topology.                            |
| [`@job-boardwalk/desktop-distribution`](../internal/desktop-distribution/README.md) | Own third-party native inputs, the component allowlist, product assembly, and archiving. |
| Moon                                                                                | Schedule application builds, distribution work, and repository checks.                   |

Desktop Distribution runs only during development and release; packaged applications do not depend
on it.

Desktop Distribution declares and verifies the third-party native executables copied into the
product. Release automation invokes that package-owned preparation boundary and passes the resolved
platform-native Caddy path through Desktop Distribution's declared build input. The assembler
verifies that the executable can load the product Caddyfile before copying it. Release automation
separately owns product version selection, archive publication, and release-channel policy. The
installed product neither fetches native inputs nor depends on a host Caddy installation.

The Compose and desktop artifacts share Dashboard's Caddyfile but not a binary supply chain.
Dashboard's Dockerfile pins the Compose Caddy image; Desktop Distribution pins the native desktop
executable. Neither declaration is authoritative for the other artifact.
