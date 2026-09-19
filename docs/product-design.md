# Product design

Job Boardwalk is a local AI job-search secretary. It turns a user's goals into durable, delegated
research: finding opportunities, revisiting sources, organizing evidence, and explaining which
roles merit attention.

This document is the source of truth for cross-application product behavior and boundaries. It
describes the intended product. The root README summarizes current scope, while application READMEs
document the software each application currently exposes and how to operate it.

## Delegation boundary

The user may delegate read-only recruiting research to the agent, including:

- navigating and searching recruiting platforms;
- collecting, refreshing, normalizing, and deduplicating job information;
- comparing opportunities across platforms and against confirmed user goals;
- maintaining a local research record and continuing that work unattended.

An unattended run remains bounded by the user's research intent, the available platform session,
and ordinary interactive pacing. It preserves partial results and reports interruptions instead of
treating incomplete access as completed research.

The user retains control when an action establishes identity, requires platform verification,
changes account state, or represents the user to another person. This includes:

- entering credentials and completing login or verification challenges;
- submitting or withdrawing applications;
- sending messages or interview responses;
- editing a profile or resume, favoriting or following, or changing other account state.

A future workflow may automate a precisely defined account action only after that action receives
an explicit authorization model of its own. General research access does not grant that authority.

## Application boundaries

Job Boardwalk separates live browser execution from durable workspace state.

The **Browser Session** owns the visible browser process, persistent profile, tabs, and generic
action lifecycle. It launches a supported browser from a long-lived local HTTP MCP service. The
agent host connects directly to the service and discovers stable project-owned tools without
owning browser lifecycle.

The **Workspace Service** owns recruiting context, normalized job facts, platform-access
observations, research reports, and their persistence. It exposes domain resources and tools
to the agent and a local API to the Dashboard. It is headless and does not own browser automation,
browser profiles, authentication cookies, or desktop windows.

The **Dashboard** is an independent view of durable workspace data. It also lets the user maintain
personal context and a collection of job-search intents. At most one intent is selected as the
current research direction; it supplies platform recommendation pages that the agent may visit
during user-requested research. Each intent associates a target position and city with those pages.
Dashboard also presents saved research reports as documents. It can consume Browser Session as an
optional capability service; its current browser integration checks service health. Workspace
reading does not require an active browser or agent conversation.

The **Desktop Manager** owns the native local-runtime control surface and operating-system
integration. It is not a WebView host: Dashboard remains a browser application, and recruiting
pages remain in Browser Session's visible persistent browser. It directly owns child-process
startup, readiness, failure containment, and ordered shutdown through each application's process
contract. Service-internal concurrency remains an implementation detail of each process. The
native GUI does not import recruiting policy, access workspace persistence, or control recruiting
pages.

The **Desktop Service Host** loads one finalized Node service payload per invocation. Desktop
Manager supplies the role, entrypoint, and runtime arguments. The service entrypoint exposes the
completion of its application-owned lifecycle, so the host exits after normal completion or
failure. The host adapts Manager's shutdown channel to the service's ordinary signal handlers; it
does not derive the installed layout, coordinate sibling processes, or own application behavior.

The **agent** coordinates browser research, workspace writes, and the conversation through which
the user takes and returns control. Browser Session enforces its own pause state during a
recognized handoff. Its adapters classify authentication or access interruptions from existing
navigation and page evidence when a platform rule is conclusive. The agent interprets unclassified
evidence and authors research conclusions; Workspace Service retains the submitted observations
and conclusions.

The Compose deployment and directory-contained desktop distribution preserve these application boundaries.
[Deployment](deployment.md) owns the supported Compose topology; [Desktop
distribution](desktop-distribution.md) owns the portable product form, runtime packaging, and
desktop release status.

A virtual desktop or remote desktop transport is not part of the product: a host without a
user-observable graphical session cannot run Browser Session.

## Runtime ownership and research evidence

Browser Session uses Workspace Service to retain job and platform-access observations. Dashboard
uses Workspace Service to read and maintain that durable workspace. Browser unavailability can
interrupt new live research; existing workspace operations depend on Workspace Service and do not
require a running browser.

Browser Session owns browser startup, recovery, and runtime diagnostics. The product form owns
service-process supervision: Desktop Manager checks the services it starts and presents their
availability in its native UI. Dashboard can independently check Browser Session health when that
optional integration is configured. It reports the outcome and time of its own check. Workspace
Service neither relays health reads nor tracks browser presence.

Platform-access observations retain the time and basis of a research assessment. Workspace Service
reconciles them into the history described under [Access observations](#access-observations).
Dashboard presents that history separately from current browser readiness. Browser Session's
[evidence submission](../apps/browser-session/README.md#evidence-submission) handles delivery
failures without stopping browser control.

### Dashboard as a browser-capability client

Browser Session is an application service whose MCP interface is one client adapter. Dashboard's
current integration reads health only; a healthy browser establishes neither platform
authentication nor authority to act. Dashboard may acquire purpose-specific HTTP operations as
product needs become concrete, with action contracts and authority checks defined for each feature.

Browser operations reuse Browser Session's in-process coordination and apply platform scope,
reference validation, and user handoff where relevant. One actor drives the session at a time.
Login, verification, messages, applications, and account changes retain their user-control boundary
regardless of which client initiated the workflow. The
[Dashboard README](../apps/dashboard/README.md#optional-browser-session-health-checks) documents the
current health-check behavior and configuration.

## Job discovery and evidence

Browser Session exposes a bounded, platform-specific job-card snapshot as live evidence. It reads
eligible pages inside a supported recruiting platform's navigation boundary without navigating,
scrolling, opening details, or persisting results. Personal-center engagement pages are rejected
rather than reported as empty job-card pages. Browser Session owns this page read, but it
does not own the selected intent, semantic relevance judgments, or durable job observations.

It separately reads the main posting description from a supported detail page. An explicit
description snapshot returns its captured observation only after Workspace Service confirms that
the evidence is preserved, so preservation does not depend on the detail page remaining open until
a later passive collection pass. If Workspace Service rejects the submission or reports it as
`stale` without applying it, the snapshot action fails instead of returning evidence that was not
preserved. When an agent has independently confirmed that the open detail belongs to a tracked
source with no retained description, external job ID, or job URL, the explicit snapshot may name
that workspace source. Workspace Service validates this explicit binding and never infers it from
similarity alone.

Card collection pages and detail pages are disjoint: recommendations surrounding a detail page
cannot be reinterpreted as the main posting. Passive collection observes recognizable cards and
main descriptions from already-open supported-platform tabs, except for personal-center engagement
pages. Explicit description writes carry agent attribution; passive observations carry system
attribution. A selected job-search intent supplies recommendation pages as agent research context,
but the collector never opens or navigates a tab for them. Browser navigation remains an explicit
action in a user-requested research task.

Every recognizable card on an eligible page contributes an observation regardless of which seed,
search path, or other research action led to it. A page with no recognizable cards contributes no
job observations. The ownership exclusion is structural and platform-specific; the collector does
not otherwise make semantic relevance judgments. A failure to read one tab is reported for that
tab without discarding evidence already captured. A recognized access interruption pauses further
page reads under the [handoff protocol](#browser-handoff).

Browser Session recognizes job-detail links through one platform-specific path contract and uses
the same match to derive a stable external job ID when the platform exposes one. Identifier
segments, rather than separate human-readable trailing slugs, define that ID. Job-card observations
and engagement synchronization therefore retain the same source identity when a platform changes
display text without changing the underlying job.

Workspace Service turns submitted observations into a durable job library rather than a page
archive. Each platform source stores its latest retained card and description observation
independently; no HTML or historical page snapshot is stored. When the facts match, a later
`observedAt` refreshes the retained observation and source check time. This produces an `unchanged`
outcome unless advancing that source changes the normalized job's derived facts; that change is
attributed and returned as `source-updated`. Different facts replace retained evidence only when
their `observedAt` is later. An older observation, or a conflicting observation with the same
`observedAt`, is left unapplied with a `stale` outcome; it neither replaces retained evidence nor
moves the check time backward. A card observation does not imply that the description was inspected,
so it never clears a stored description. The description's capture time and Browser Session's local
truncation state remain explicit. The normalized job is derived from the observations currently
stored for its sources.

Within a platform, an external job ID is the preferred source identity, followed by the job URL
pathname and then normalized company, title, and location when a detail link is unavailable. Across
platforms, Workspace Service merges sources only when normalized company, title, and location
identify the same job. Normalization standardizes Unicode, case, and separators; it does not infer
company aliases or discard phrases from job titles. Partial cards without that identity remain
separate.

Job-library reads expose description coverage and distinguish missing descriptions with a known
detail identity from those without one. Workspace Service owns the
[coverage query](../apps/workspace-service/README.md#library-queries-and-description-coverage)
and [source-binding validation](../apps/workspace-service/README.md#source-binding). Dashboard owns
how the library presents those results.

## Engagement tracking

Each recruiting platform exposes personal-center categories for interested, contacted, applied, or
interviewed jobs. Job Boardwalk calls an observed membership in one of these categories a
**job engagement**. Engagements are non-exclusive relations on a platform source: one source may be
both contacted and applied, for example. They are evidence of how the platform classified the job
when observed. Each record contains the platform category and its first and latest observation
times.

Browser Session maps the platform categories to `interested`, `contacted`, `applied`, and
`interviewed`. A user-requested synchronization task addresses one platform and category at a time.
Each explicit call brings the selected tab to the foreground, reads one bounded batch from that
category, and writes the observed evidence. When the platform supports continuation, another call
for the same platform and category continues the current scan.

A scan is complete only when the platform-maintained total and captured evidence establish the
full visible category within the service's collection budget. Otherwise it remains partial.
Browser Session owns the [scan budget and continuation contract](../apps/browser-session/README.md#explicit-job-engagement-synchronization).
That budget limits evidence volume; platform cards provide category membership without an event
time. A redirected category tab remains associated with the platform. During user handoff it
remains untouched; after control returns, a later explicit call may reuse it.

`interested` represents a reversible current classification, so a complete snapshot may remove
relations absent from the platform list. The other engagement kinds preserve historical evidence
that the platform once included the source in that category; a later omission does not remove them
because a platform may limit or age out personal-center history. Partial snapshots only add or
refresh observed relations. Event time and the resume artifact remain unknown because platform
categories provide neither datum.

An empty engagement list means no engagement has been recorded. It does not establish that the
account has never contacted or applied: even complete scans cover only the platform-visible history.
Detail-page controls such as “继续沟通” are separate page evidence; they do not establish membership
in a personal-center category.

Engagements share the normalized job collection. Removing an `interested` relation leaves the job,
its other sources, and its historical engagement evidence in the library.

Dashboard exposes the four engagement kinds as filters within one job library and shows when the
displayed platform records were most recently observed. A combined tracked view takes the union of
those relations without turning them into a single workflow state.

## Browser handoff

Login, verification, applications, messages, and account changes require the user to take control
of the visible browser. The agent stops browser activity during that handoff and waits for the
user to explicitly return control. Workspace Service may finish writes from previously captured
evidence because those writes do not drive the browser.

For login, Browser Session can inspect existing platform pages and prepare a usable login
interface. If it observes authentication, research can continue without a handoff. Otherwise,
a ready login interface starts the pause. An adapter-recognized verification request or access
denial also pauses the session, including during login preparation or passive collection.
The agent handles interruptions that adapters do not recognize and coordinates other
user-controlled actions through the conversation. When the service retains an interruption, its
platform and source URL identify the evidence behind the handoff.

After the user returns control, the agent re-observes the relevant page before resuming research.
Returned control establishes permission to observe; the new evidence determines whether the page
still requires user action. Browser Session owns the [login preparation, pause, and control-return
protocol](../apps/browser-session/README.md#browser-handoff).

Browser Session keeps a dedicated persistent profile so ordinary browser session state survives
service restarts. Credentials and verification input stay inside the platform window. Job Boardwalk
does not query cookies or browser storage. Browser snapshots omit form-control values and password controls,
and HTTP and MCP responses do not expose authentication cookies or browser profile contents. Browser
Session exposes generic interactions with elements from a recent snapshot and validates the
explicit destination of captured links against the current platform. It does not infer whether a
button, text control, or selection control represents research or an account action; the agent
applies the delegation boundary before acting.

## Access observations

Platform-access observations are historical evidence about authentication or an access
interruption. Each observation carries its source page URL and capture time. Authentication
is recorded separately from verification requests and access denial.

Browser Session derives access observations from platform rules applied to top-level
navigation responses and existing page reads. The agent can record independently interpreted
evidence when no adapter classifies it. Unclassified evidence leaves existing observations
unchanged. [Platform coverage](../apps/browser-session/README.md#platform-coverage) defines the
recognized pages and evidence for each adapter.

Workspace Service retains observations by platform and source URL, reconciling repeated evidence
by observation time. It owns the
[observation API and overview projection](../apps/workspace-service/README.md#platform-access-observations).
Browser Session owns [submission](../apps/browser-session/README.md#evidence-submission). Dashboard
presents the resulting summaries; its [data display](../apps/dashboard/README.md#data-ownership-and-freshness)
is separate from live browser inspection, which remains with Browser Session.

## Reliable browser research

Browser research operates as a continuous user-delegated session. Execution therefore favors a
visible browser and reuse of the selected tab and session while they remain healthy, low
concurrency, and ordinary navigation flow.

The agent observes the page at workflow boundaries and after meaningful page or handoff changes.
It checks operation results for control state and access evidence before continuing; an earlier active
snapshot does not establish that the next operation is permitted. Summarizing page text preserves
those independent signals. Navigation, paging, refreshes, and retries use bounded pacing. Each retry
requires new evidence and a finite limit.

The visible browser outcome and the user's observation govern whether an action visibly succeeded.
When a backend URL, page title, or tool response conflicts with the user's report, the agent
re-observes and reconciles the live page before continuing.

A browser action whose response is lost has an unknown outcome. Browser Session contains that
failure to the request rather than replaying the action. Navigation and inspection timeouts,
including repeated timeouts, establish neither their cause nor the absence of a visible access
decision and do not authorize a reload, replacement page, or browser restart.

Before recovery changes the visible page, the agent re-observes when possible. If the driver still
cannot inspect the page, the agent asks what the user sees in the visible window. Recovery preserves
the platform's visible access decisions: if the platform presents verification or denies access,
the agent stops browser input, records the interruption, and waits for the user.

## Research reports

Research reports preserve authored findings for later reading, independently of the conversation
that produced them. The author chooses the subject and document structure, explaining conclusions,
supporting evidence, uncertainties, and outstanding research in the body. Evidence dates establish
the context of those findings. The report's creation and update times record when the document was
saved and revised.

Saved reports remain available until explicitly deleted. Replacing a report overwrites its previous
content; earlier revisions are not retained. Workspace Service owns the saved document, and
Dashboard presents it for reading. Report content cannot embed pages or expose browser or agent
controls.

[Workspace Service](../apps/workspace-service/README.md#research-reports) documents report validation,
storage, and read/write contracts. [Dashboard](../apps/dashboard/README.md#report-rendering) documents
Markdown rendering and link behavior.

## Dashboard surface

Dashboard has three reader paths:

- the workspace overview for the current job-search intent, personal context, and platform-access
  observations;
- a paginated job library for normalized job facts and merged platform sources, including a combined
  tracked view, engagement-category filters, and filters for description availability;
- a report library and Markdown reader for saved research documents.

### Workspace overview

The overview follows task relevance rather than the order in which capabilities were added. The
selected job-search intent and current personal context form the primary research basis.
Platform-access evidence appears in a compact secondary rail and gains visual emphasis only for an
unresolved access interruption. Counts already present in global navigation are not repeated
as overview sections. The independent browser-service panel reports optional health checks as
described under [Runtime ownership and research evidence](#runtime-ownership-and-research-evidence).

Personal context is current research input, not immutable history. The overview initially shows a
bounded read-only summary, and the user can expand every current personal fact in place. A separate
management surface owns creating, revising, selecting, and removing job-search intents and personal
facts. Removing a fact stops it from influencing future interpretation; Workspace Service retains
change attribution separately.

### Job library

Job cards remain compact and comparable regardless of description length. Description availability
belongs to the library-level summary and filters; a card presents a description action only when
there is content to read. A collected description opens in a dedicated dialog rather than expanding
inside its card, so reading one job does not reflow the surrounding list. Only one description is
open at a time, and closing it returns the user to the same list context. On a narrow screen, the
dialog fills the viewport; its header remains visible while the description scrolls independently.
The list heading reports description coverage for the current search, platform, and engagement
scope before a description filter narrows the cards, so selecting jobs without descriptions does
not hide the baseline needed to understand the result.

### Product direction

As the product grows, it should also include:

- other research intents;
- research runs, partial progress, and interruptions;
- further report formats and exports when Markdown is no longer sufficient.

Browser features follow the [browser-capability client boundary](#dashboard-as-a-browser-capability-client).
Reports remain documents, including when other Dashboard features gain browser operations.
