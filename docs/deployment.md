# Deployment

Job Boardwalk's supported deployment topology runs Workspace Service and Dashboard as separate
Docker Compose services, while Browser Session runs as a companion in the user's graphical host
session. Caddy serves the finalized Dashboard client from its container.

The browser is intentionally outside Docker because its visible window and persistent host profile
are the boundary for login, verification, and other user-controlled actions.

## Requirements

- Container host: Docker Engine with Docker Compose, plus BuildKit when building images from source
- Graphical host: a repository checkout, Chromium installed by Patchright, and the Node.js and pnpm toolchain
  declared in the root [`package.json`](../package.json)

Source image builds bootstrap their own toolchain. Host Node.js and pnpm are needed only for Browser
Session and source development, not for building or deploying the images.

## Build from source

Build the two application images and start them:

```sh
docker compose -f compose.yaml -f deploy/compose.build.yaml up --build --detach
docker compose ps
```

The build overlay is needed only when producing images from this repository. Subsequent lifecycle
commands use the root Compose model.

The Dockerfiles start from pnpm's standalone image, which bootstraps the pnpm version requirement
declared by `devEngines.packageManager`. Each builder uses pnpm's public `runtime set` command to
prepare the Node.js version selected by `devEngines.runtime`, then performs a filtered frozen install
for its application dependency closure. Build scripts run with that Node.js version; Workspace
Service also exports the same executable into its runtime image. The exact toolchain resolutions and
checksums remain in `pnpm-lock.yaml`, so a Node.js or pnpm update changes the root toolchain
declaration and lockfile rather than either Dockerfile.

The filtered frozen install is each image's dependency-validation boundary. When invoking the
application-owned build script, the builder disables pnpm's full-workspace pre-run status check so
that pnpm does not replace the filtered closure with a complete workspace install.

## Deploy existing images

On another machine, provide published image references and start the root Compose model without
the repository build overlay:

```sh
export JOB_BOARDWALK_WORKSPACE_SERVICE_IMAGE=registry.example/job-boardwalk/workspace-service@sha256:...
export JOB_BOARDWALK_DASHBOARD_IMAGE=registry.example/job-boardwalk/dashboard@sha256:...
docker compose up --detach
```

The deployment host needs `compose.yaml`, Docker Engine, and access to the images. It does not need
Node.js, pnpm, the monorepo, or either Dockerfile.

## Start Browser Session

After either container startup path, Compose waits for Workspace Service readiness before starting
Dashboard. Both published ports bind only to host loopback:

- Workspace Service and MCP: <http://127.0.0.1:54310>
- Dashboard: <http://127.0.0.1:54311>

Browser Session runs from the repository checkout in the graphical host session. Install its
dependencies and Chromium once:

```sh
pnpm install
pnpm --filter @job-boardwalk/browser-session exec patchright install chromium
```

Then start the host companion:

```sh
pnpm exec moon run browser-session:dev
```

The agent host connects to <http://127.0.0.1:54312/mcp>. Browser Session uses
<http://127.0.0.1:54310> for status reports, selected-intent reads, and job writes. It may start
before the containers: those operations retry without transferring browser ownership to Compose.

## Observe and update

Inspect health and logs:

```sh
docker compose ps
docker compose logs --follow workspace-service dashboard
```

Rebuild after a source or dependency change:

```sh
docker compose -f compose.yaml -f deploy/compose.build.yaml up --build --detach
```

Compose replaces the affected containers without replacing the named volume. Browser Session keeps
running and renews its status lease when Workspace Service becomes available again.

Stop containers while retaining the workspace:

```sh
docker compose down
```

Do not add `--volumes` unless the workspace is intentionally being destroyed.

## Persistence and backup

Workspace Service is the only writer to the SQLite database in the `workspace-data` named volume.
The Browser Session profile remains under the graphical host user's data directory and has a
separate lifecycle.

Take Workspace Service offline before making a filesystem-level volume backup so SQLite and its
sidecar files form one consistent snapshot:

```sh
docker compose stop workspace-service
docker volume inspect job-boardwalk_workspace-data
```

Back up the inspected volume with the host's normal Docker-volume backup procedure, then restart
the service:

```sh
docker compose start workspace-service
```

A restore replaces the complete volume while Workspace Service is stopped. This pre-release
project does not migrate exploratory schemas: a persistence-model refactor replaces the development
database and the single Drizzle baseline together.

## Source development

Compose deployment is the supported runtime topology. For fast source iteration, developers may run
Workspace Service and Dashboard directly:

```sh
pnpm exec moon run workspace-service:dev
pnpm exec moon run dashboard:dev
```

These development servers retain the same loopback ports and API boundaries. Vite's proxy remains
a development tool; Dashboard's Caddyfile owns the production boundary for Compose and desktop
packaging.

## Runtime boundaries

The `workspace-service` container is read-only apart from `/tmp` and the `workspace-data` named
volume. It runs as the unprivileged Node.js image user, drops Linux capabilities, and accepts
traffic only from the private Compose network and the loopback-published host port.

The `dashboard` container is read-only apart from `/tmp` and runs as an unprivileged Caddy user.
Caddy serves the built static client, sends its browser security policy, handles SPA route
fallback, and proxies `/api` to Workspace Service. It does not receive the browser profile, Docker
socket, Workspace volume, or Browser Session MCP endpoint.

The Compose network is internal. The containers do not need outbound internet access at runtime;
Dashboard uses system font stacks and loads no third-party assets.

## Compose process contract

The finalized Workspace Service accepts runtime paths and listener values through process
configuration, reports health over HTTP, writes operational output to standard streams, handles
`SIGINT` and `SIGTERM`, and reports failure through its exit status. Compose supplies the container
paths and listener values, mounts persistence, creates the private network, publishes the loopback
port, checks health, and supervises the process.

Browser Session follows the same small process contract as a host companion but remains outside
the Compose network and container lifecycle. Source-development defaults and environment overrides
belong to its [application README](../apps/browser-session/README.md#run-browser-session-from-source).
The directory-contained desktop adaptation belongs to
[Desktop distribution](desktop-distribution.md#runtime-payload).
[Development](development.md#generated-artifacts-and-language-boundaries) defines when this
process-and-HTTP boundary would require a language-neutral schema.

## Deployment file ownership

The deployment files follow their runtime ownership rather than sharing one generic infrastructure
directory:

- `compose.yaml` stays at the repository root because it is the public entry point for the one
  application-wide topology. It consumes configurable image references and therefore does not
  require source files or pnpm at the deployment host.
- `deploy/compose.build.yaml` is the optional source-build overlay. It connects each Compose service
  to its application-owned Dockerfile without making source builds part of the deployment model.
- `apps/dashboard/Dockerfile` and `apps/workspace-service/Dockerfile` belong to their
  independently deployable applications. Each has a colocated `Dockerfile.dockerignore` that
  excludes unrelated applications from its build context. Dashboard's runtime stage uses the
  pinned Caddy image and its application-owned Caddyfile.
- Both Dockerfiles use the repository as their build context because their builder stages compile
  workspace-owned packages. Root manifests, the lockfile, and dependency patches remain build inputs
  because pnpm resolves each filtered application closure under the workspace dependency policy;
  those inputs do not become application runtime contents. The Dockerfile location and build context
  therefore express different boundaries: image ownership belongs to the application, while source
  dependency resolution belongs to the workspace.

The `x-container-runtime-policy` Compose fragment names the security, lifecycle, and logging policy
shared by both containers. Each service declaration then describes only its own image reference,
port, storage, dependencies, and readiness behavior.

## Artifact boundaries

pnpm and the monorepo exist only in each image's builder stage. Each container application build
produces a complete deployment artifact under its own `dist/` directory:

- Dashboard produces static HTML, CSS, and JavaScript.
- Workspace Service produces a runtime directory with its finalized ESM entry and complete Drizzle
  migration baseline.

The runtime stages combine those artifacts only with their runtime-owned inputs: Dashboard adds its
Caddyfile and built client to the pinned Caddy image, while Workspace Service copies the completed
Node service directory unchanged and adds the locked Node.js executable and system libraries. The
desktop product consumes the same Workspace Service directory through its shared Node host. Its
public runtime entrypoint is `index.mjs`; the service artifact contains no pnpm, `node_modules`,
workspace manifests, `workspace:*` references, or source paths because its dependencies are
bundled.

Browser Session separately produces a portable Node.js application package for host and desktop
runtimes. Its [application README](../apps/browser-session/README.md#run-browser-session-from-source)
owns that artifact's build and layout; [Desktop distribution](desktop-distribution.md) owns its
installed placement.

The same Caddyfile accompanies the desktop staging tree, so routing and security policy do not fork
by deployment topology. Binary ownership remains separate: Dashboard's Dockerfile selects the
Compose image, while [Desktop Distribution](desktop-distribution.md#build-ownership) owns the
native desktop executable input.

The resulting OCI images are the deployment artifacts. `compose.yaml` defaults to the local image
names `job-boardwalk/workspace-service:local` and `job-boardwalk/dashboard:local`; the
`JOB_BOARDWALK_WORKSPACE_SERVICE_IMAGE` and `JOB_BOARDWALK_DASHBOARD_IMAGE` variables can
replace them with registry tags or immutable digests.

[Desktop distribution](desktop-distribution.md) defines the separate directory-contained desktop
prerelease. That work does not alter the Compose artifact contract owned by this document.
