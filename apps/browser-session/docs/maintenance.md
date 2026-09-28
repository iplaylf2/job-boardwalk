# Browser Session maintenance

This document owns adapter, page-capture, driver, and launch constraints.
For operation and tool behavior, see the [Browser Session README](../README.md).

## Adapters and page capture

Tool inputs describe targets and observable intentions. Resource bounds for text, card count,
observation duration, and polling frequency belong to the service implementation. They bound work
and response size rather than define platform readiness. Observation conditions belong to the
read that can establish them. Add platform-level operations such as search submission or next
result page only when the adapter can identify the real control and report evidence for the
requested outcome.

The [platform catalog](../../../packages/platform-catalog/src/index.ts) owns cross-application
navigation scope, entry and login URLs, engagement destinations, and pagination. A null
engagement destination declares an unsupported category.

Within Browser Session, [page definitions](../src/browser/platforms/page-definitions.ts) register
one module per catalog `PlatformId`. Each module owns collection-page recognition,
authentication evidence, search-card and detail selectors, and job-link rules. The recruiting
adapter factory combines those definitions with catalog metadata. Job-link recognition and
extraction consume the same path rules when assigning stable external IDs.

[Engagement adapters](../src/browser/job-engagement/platform-adapters.ts) own page capture and
category totals. Their shared factory derives targets, URL matching, and continuation from the
catalog. All engagement DOM captures implement the [capture
contract](../src/browser/job-engagement/types.ts); callbacks remain self-contained because they
execute in the browser page realm. Shared job-link rules are passed as input rather than copied
into a callback.

The same execution boundary applies to card, description, snapshot, and scroll captures. Keep DOM
helpers inside the serialized callback and pass configuration as input; imported Node-side helpers
are unavailable in the page. Local object methods avoid the Node-side naming helpers that the source
runner can inject into nested function declarations. When the complete callback exceeds the function
length limit, explain serialization in a local disable; its nested helpers still receive size and
complexity checks.

Page definitions may expose collection-page interaction selectors with a role and an owning
context selector. These only apply on recognized collection pages; the shared snapshot and
action boundary owns visibility, references, validation, and popup handling.

To add a platform, update the catalog, register its page definition, and provide its engagement
capture and total handling. Add its document under `docs/platforms/` and link it from [Platform
coverage](../README.md#platform-coverage). Keep platform-specific interpretation and validation limits
there; common tool instructions describe shared behavior, and capability summaries derive from
the catalog. Validate accepted and rejected page boundaries, source identity, empty and partial
categories, and any continuation behavior. Page actions and collection orchestration consume the
shared interfaces. Access conclusions requiring general page interpretation remain the agent's
responsibility.

## Driver boundary

Browser Session uses Patchright rather than Playwright because live testing showed BOSS navigating
itself to `about:blank` when the Runtime protocol domain was enabled. Patchright provides the
required page API without enabling that domain. Browser Session also leaves console event
collection disabled; do not add Playwright or raw `Runtime.enable` or `Console.enable` calls
alongside it.

### Demand-driven request interception

Patchright avoids `Runtime.enable` for initialization scripts by registering a Playwright route
that intercepts HTML responses. Patchright 1.63.0 also enables Chromium's Fetch interception for
every page at construction, before any route exists. Browser Session does not register request
routes or use `addInitScript`, `exposeFunction`, `exposeBinding`, tracing, or clock features. Eager
interception therefore puts every request through a pause-and-continue exchange without serving a
Browser Session requirement.

The workspace patch restores the constructor's existing demand-driven
`updateRequestInterception()` call. Registering a route still makes `needsRequestInterception()`
enable Fetch interception, so the patch narrows when interception starts; it does not remove
Patchright's initialization-script mechanism. In live A/B testing, eager interception allowed the
BOSS root and city document responses to return but left the city document uncommitted.
Demand-driven interception completed the same-tab root-to-city navigation. The fix is driver-wide,
not a BOSS URL exception.

The root `pnpm-workspace.yaml` applies the version-specific patch. Reassess it before Browser
Session adopts a request-routing, initialization-script, binding-exposure, tracing, or clock API.
Test both the new interceptor and visible BOSS root-to-city navigation before accepting such a
change. Remove the patch when Patchright no longer enables Fetch interception without an active
interceptor; after removal, perform a frozen install, build the Browser Session artifact, and
repeat the navigation check.

## Browser launch policy

The [graphics backend option](../README.md#graphics-backend) is applied at the shared launch boundary.
Platform adapters use this common environment; backend selection is independent of platform and URL.
`default` leaves Chromium's graphics flags unchanged. `swiftshader` passes
`--use-gl=angle --use-angle=swiftshader` to select ANGLE's software OpenGL ES driver. It preserves
the process sandbox and leaves the software renderer visible to pages. This driver mode does not
enable the separate `--enable-unsafe-swiftshader` WebGL fallback flag.

Browser Session inherits the launching process's environment, including locale, timezone, display,
and proxy configuration.

Browser Session explicitly enables Chromium's process sandbox for every launch. Patchright
otherwise passes `--no-sandbox` by default; do not restore that default to work around host setup or
to silence a browser warning. A browser that cannot launch with its process sandbox is incompatible
with Browser Session and must fail at the launch boundary. The same launch policy applies to
Patchright's installed Chromium, a named browser channel, and an explicit browser executable.

Patchright owns its other default command-line switches, including
`--disable-blink-features=AutomationControlled`, which Patchright uses to avoid detection through
`navigator.webdriver`. Edge may warn that this exact switch is unsupported. This is an expected
browser response to the Patchright launch policy, not by itself a launch failure. Do not hide it
with another switch or host policy merely to suppress the warning. Assess changes to driver defaults
against the behavior they affect, and validate representative affected browser and launch paths.
Expand that coverage when a change alters behavior shared across browser families; record the
tested versions and paths so the evidence does not imply untested compatibility.

## Runtime dependency packaging

Patchright remains an external runtime dependency so its generated modules and package-relative
resources stay together. A Patchright upgrade must preserve that package boundary and pass the
Browser Session artifact build.
