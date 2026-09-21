# Product design

Job Boardwalk is a local AI job-search secretary. It provides a visible recruiting
browser and a durable workspace for an agent working within the user's delegated scope.

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

General research access does not grant authority to perform account actions.

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
authentication nor authority to act.

Browser operations reuse Browser Session's in-process coordination and apply platform scope,
reference validation, and user handoff where relevant. One actor drives the session at a time.
Login, verification, messages, applications, and account changes retain their user-control boundary
regardless of which client initiated the workflow. The
[Dashboard README](../apps/dashboard/README.md#optional-browser-session-health-checks) documents the
current health-check behavior and configuration.

## Job discovery and evidence

Browser Session reads bounded job-card and main-description evidence from supported pages.
Explicit card reads return live evidence without persisting it. Explicit description reads return
only after Workspace Service retains the observation. Passive collection separately reads eligible
open tabs and submits card or description observations. These collection paths never navigate,
scroll, or open details. Personal-center engagement pages use the separate synchronization boundary.

A selected job-search intent provides context for the agent's navigation. It does not schedule
collection or cause either service to open its saved pages. Browser Session owns page extraction;
the agent owns relevance judgments. Unclassified page evidence remains available for agent
interpretation. A recognized access interruption pauses browser reads under the
[handoff protocol](#browser-handoff).

Workspace Service owns source identity, observation freshness, and normalized jobs. Each platform
source retains its latest card and description observations independently, including their capture
times. Card updates preserve retained descriptions. Older evidence does not overwrite newer
observations. The workspace stores extracted facts rather than HTML or historical page snapshots.

Source identity and normalized job identity are distinct. A platform's stable job ID or detail link
identifies a source when available; sources with incomplete identity may later be explicitly bound
to a confirmed detail page. Workspace Service validates that association. A normalized job may
group several sources, but each source keeps its own provenance, description, and engagement
relations.

[Browser Session](../apps/browser-session/README.md#job-evidence-reads-and-passive-collection)
owns read scope, extraction rules, and collection behavior.
[Workspace Service](../apps/workspace-service/README.md#job-library) owns identity matching,
source-binding validation, write outcomes, and library queries.
[Dashboard](../apps/dashboard/README.md#job-library) owns their presentation.

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

Dashboard provides a workspace overview, a job library, and a report reader. The overview presents
the selected job-search intent and personal context alongside platform-access observations and an
independent browser-health check. The library presents stored jobs and their source evidence;
reports remain authored documents.

Personal context is editable research input. Removing a fact removes it from subsequent workspace
reads; Workspace Service retains change attribution separately. Existing conversations or saved
reports are not rewritten by that change.

The [Dashboard README](../apps/dashboard/README.md#reader-path) owns navigation, editing surfaces,
filters, dialogs, and data-refresh behavior.
