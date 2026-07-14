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

## Browser control and handoff

- Use the Browser Session MCP tools configured by the current agent host for recruiting-platform
  navigation and research. Do not launch an unrelated browser profile or create an ad hoc
  automation script when these tools are available.
- Login, verification, credentials, applications, messages, and account changes remain under user
  control. When one appears, stop browser input, state exactly what is visible, and ask the user to
  take over the project browser window.
- Treat a browser action as visibly successful only after the controlled page evidence and the
  user's observation agree. A backend URL, page title, tool success response, or cookie alone must
  not override the user's report that a different page or window is visible.
- Resume browser input only after the user says the handoff is complete. Re-observe the live page
  before continuing, and report any remaining login or verification barrier.
- Reuse an existing platform session before requesting login. While the user has control of the
  browser for login or verification, do not open extra pages, refresh, or send browser input until
  the user explicitly returns control. This pause does not restrict ordinary navigation, paging,
  retries, or necessary refreshes during agent-controlled research.
- Keep Browser Session and the extension-bound tab open while handing control between user and
  agent. Browser profile persistence belongs to the graphical host; the project never copies or
  stores its cookies.

## Browser action pacing

- Use `browser_observe_platform_access` at workflow boundaries and after meaningful page or
  handoff state changes. Each call performs one semantic read.
- Normal automation may observe, retry, navigate, or refresh when the workflow requires it, but
  actions must be paced and bounded. Avoid tight polling loops, repeated visible page churn, and
  retries that continue without new evidence. Route names alone are not evidence of a verification
  barrier.

## Local services

- Workspace Service must be running at `http://127.0.0.1:54310` for browser access observations to
  be saved.
- Dashboard is the read-only durable view at `http://127.0.0.1:54311`; it does not establish or
  verify a live browser session.
- Browser Session requires `JOB_BOARDWALK_PLAYWRIGHT_MCP_URL` to point at a graphical host running
  Playwright MCP with the official extension. It initializes the current extension-bound tab once
  before exposing browser actions; do not bypass it with a second MCP client or ad hoc script.
