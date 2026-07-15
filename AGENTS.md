# Job Boardwalk agent workflow

## Development stage

- Treat this repository as a pre-release project. Refactors replace the current contract directly;
  do not add legacy adapters, fallback fields, dual reads or writes, compatibility aliases, or
  transitional code unless the user explicitly introduces a compatibility requirement.
- The persistence schema is the source of truth. A schema refactor replaces the development
  database and the entire Drizzle baseline so `migrations/` contains one complete current model,
  never an upgrade chain for earlier exploratory databases.

## Concurrency model

- Preserve shajara as the application's structured-concurrency model. Long-lived services own one
  top-level scope; resources, concurrent work, cancellation, and shutdown stay in `RiteCoroutine`
  routines. Keep `async`/Promise interop at external SDK, HTTP, and process-entry boundaries and
  adapt it with `until(...)` rather than spreading `async` through application code.
- Application coordination interfaces return `RiteCoroutine`; they do not hide an internal
  `async` call tree behind a Promise-returning controller or service method. Adapt each external
  Promise at the leaf call that creates it, and use shajara primitives for application-owned waits,
  races, and cancellation.

## Dependency versions

- The default pnpm catalog is the shared-version contract: an external package belongs there when
  two or more workspace manifests declare that same package. Those manifests use `catalog:`.
- An external dependency used by only one workspace manifest keeps its version in that manifest,
  even when it is architecturally important. Workspace-owned packages always use `workspace:*`.
  When usage changes, move the version and every affected declaration together so the rule remains
  mechanically visible.

## Browser control and handoff

- Use the Browser Session MCP tools configured by the current agent host for recruiting-platform
  navigation and research. They are backed by the visible persistent Patchright browser owned by
  Browser Session. Do not launch another browser profile or create an ad hoc automation script when
  these tools are available.
- Login, verification, credentials, applications, messages, and account changes remain under user
  control. When research reaches one of these actions, stop browser input, state exactly what is
  visible, and ask the user to take over the project browser window.
- Treat the BOSS HTTPS allowlist only as a navigation scope. It does not authorize login,
  verification, applications, messages, or account changes.
- Treat a browser action as visibly successful only after the controlled page evidence and the
  user's observation agree. A backend URL, page title, tool response, or other backend signal must
  not override the user's report that a different page or window is visible.
- Resume browser input only after the user says the handoff is complete. Re-observe the live page
  before continuing, and report any remaining login or verification barrier.
- Reuse an existing platform session before requesting login. While the user has control of the
  browser for login or verification, do not open extra pages, refresh, or send browser input until
  the user explicitly returns control. This pause does not restrict ordinary navigation, paging,
  retries, or necessary refreshes during agent-controlled research.
- Keep Browser Session and its controlled tab open while handing control between user and agent.
  Its dedicated profile persists at the configured Browser Session profile path; tools never read
  or return its cookies or storage contents.

## Browser action pacing

- Use `browser_snapshot` at workflow boundaries and after meaningful page or handoff
  state changes. Browser Session does not interpret page content; the agent owns each semantic read.
- Normal automation may observe, retry, navigate, or refresh when the workflow requires it, but
  actions must be paced and bounded. Avoid tight polling loops, repeated visible page churn, and
  retries that continue without new evidence. Route names alone are not evidence of a verification
  barrier.

## Testing

- Test observable behavior at the boundary that owns it. Cover representative accepted and rejected
  cases for public MCP capabilities, URL and input validation, error classification, persistence
  invariants, and resource lifecycle.
- Keep tests independent of undocumented routes, reader-facing prose, and third-party driver
  internals.

## Local services

- Treat `.env.example` as the configuration reference and `.env` as optional local machine state.
  Server entry points do not load `.env` automatically; the user or agent host decides how to
  supply its values. Inspect the local file before asking the user to repeat host addresses, but
  never print or commit its contents.
- Workspace Service runs at `http://127.0.0.1:54310` and owns durable observations submitted after
  agent interpretation; Browser Session does not write them automatically.
- Dashboard is the read-only view at `http://127.0.0.1:54311`; it shows durable workspace data and
  leased Browser Session presence, but does not establish or control the browser session.
- Browser Session launches a visible persistent Patchright Chromium process and owns its dedicated
  profile path. Workspace Service independently owns its database path; the services do not share a
  filesystem state root. Browser Session reports runtime status to Workspace Service, which derives
  short-lived presence without becoming a prerequisite for browser control. Run Browser Session in
  a graphical desktop session and do not bypass it with a second browser controller.
