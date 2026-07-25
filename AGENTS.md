# Job Boardwalk agent guidance

This file contains repository-wide invariants and routes to task-specific rules in their owning
files. Read a linked source only when its trigger applies.

## Repository-wide invariants

- Treat this repository as a pre-release project. Replace contracts directly; do not add legacy
  adapters, fallback fields, dual reads or writes, compatibility aliases, or transitional code
  unless the user explicitly requires compatibility.
- Preserve shajara as the structured-concurrency model. Long-lived services own one top-level
  scope, and application coordination interfaces return `RiteCoroutine` rather than hiding an
  internal Promise call tree. Adapt external Promises with `until(...)` at the leaf that creates
  them. Use shajara primitives for application-owned waits, races, cancellation, and shutdown.
- Test observable behavior at the boundary that owns it, including representative accepted and
  rejected cases. Keep tests independent of undocumented routes, reader-facing prose, and
  third-party driver internals.
- Use unmistakably synthetic employers, recruiters, identities, activity counts, and composite job
  content in tracked tests and documentation. Live browser or development-database observations
  must not become fixtures or examples.

## Task-specific guidance

- Before changing application behavior or development workflows, read the relevant sections of that
  application's README.
- Before changing dependencies, follow the version-placement policy in
  [`pnpm-workspace.yaml`](pnpm-workspace.yaml).
- Before changing the persistence schema or migrations, read
  [`apps/workspace-service/README.md`](apps/workspace-service/README.md#persistence). It owns the
  single-baseline development model and database replacement workflow.
- Before changing Browser Session lifecycle, page-control, adapter, or driver boundaries, read its
  [runtime behavior](apps/browser-session/README.md#runtime-behavior) and
  [maintenance constraints](apps/browser-session/README.md#maintenance-constraints).
- Before controlling a recruiting-platform browser, read
  [Browser handoff](docs/product-design.md#browser-handoff),
  [Access observations](docs/product-design.md#access-observations), and
  [Reliable browser research](docs/product-design.md#reliable-browser-research).
- Before changing Compose, containers, ports, runtime topology, deployment artifacts, backup, or
  restore behavior, read [`docs/deployment.md`](docs/deployment.md).
- Before local-service setup or diagnosis, read
  [Run Job Boardwalk](README.md#run-job-boardwalk) and [`.env.example`](.env.example).

## Browser authority boundary

- Use the project Browser Session for recruiting-platform navigation and research. Do not launch a
  second browser controller or ad hoc automation profile.
- Login, verification, credentials, applications, messages, and account changes remain under user
  control. A supported platform's HTTPS scope authorizes research and login-handoff preparation
  only. Stop browser input during user control and resume only after the user explicitly returns it.
