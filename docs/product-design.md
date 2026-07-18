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
action lifecycle. It launches Patchright Chromium from a long-lived local HTTP MCP service. The
agent host connects directly to the service and discovers stable project-owned tools without
owning browser lifecycle.

The **Workspace Service** owns recruiting context, normalized job facts, platform-access
observations, research reports, and their persistence. It also owns the in-memory presence tracker
that applies short leases to Browser Session status reports. It exposes domain resources and tools
to the agent and a local API to the Dashboard. It is headless and does not own browser automation,
browser profiles, authentication cookies, or desktop windows.

The **Dashboard** is an independent view of durable workspace data and leased Browser Session
presence. It also lets the user maintain personal context and a collection of job-search intents.
At most one intent is selected as the current research direction, which enables passive
collection; each intent associates a target position and city with its corresponding platform
recommendation pages. It also presents unexpired research reports as workspace documents. Dashboard
neither controls the browser nor requires an active agent conversation.

The **agent** coordinates the two service boundaries and owns the human-handoff state in its
conversation with the user. Browser tools produce live evidence; workspace tools preserve the
durable facts and conclusions derived from that evidence. A Browser Session adapter may derive an
authentication assessment from a real top-level navigation response or a bounded page snapshot
when it has a conclusive platform-specific rule. The agent interprets evidence not covered by an
adapter.

## Runtime presence and reporting

Browser Session sends bounded status reports directly to Workspace Service. Each status report
includes browser availability, version, and tab count, plus a generic failure summary when
unavailable and any platform authentication observations derived from navigation responses or
bounded snapshots. Detailed browser errors remain in the Browser Session process log so status
reports do not expose local paths or launch parameters. Workspace Service treats runtime status as
a short lease and stores only changed access observations: before the first status report, presence
is unknown; after a lease expires, presence is offline. Reporting failure never prevents Browser
Session from operating. Status reports contain no cookies, credentials, storage contents, or
unrestricted page text.

## Job discovery and library

Browser Session exposes a bounded, platform-specific job-card snapshot as live evidence. It
extracts already-loaded job cards from any page inside a supported recruiting platform's
navigation boundary without navigating, scrolling, opening details, or persisting results. Browser
Session owns this page read, but it does not own the selected intent, semantic relevance judgments,
or durable job observations.

A selected job-search intent enables passive collection and bounds how long it runs. The intent's
recommendation pages are seed pages that Browser Session keeps available; they are not a whitelist
of pages eligible for collection. During that period, recognizable job cards from every open
supported-platform tab may be submitted, including related search results and other discovery
surfaces reached during research. A failure to read one tab is reported for that tab and does not
discard observations from other tabs.

Workspace Service turns submitted observations into a durable job library rather than a page
archive. Each platform source keeps its job and discovery links plus normalized fields; no HTML or
historical page snapshot is stored. Workspace Service merges sources when their normalized company,
title, and location identify the same job. An observation fingerprint skips unchanged records.
Partial cards without that identity remain separate.

## Browser handoff

The login-handoff workflow keeps identity actions under user control while preserving the browser
session used for research:

1. When the user requests login, or visible page evidence shows that the requested workflow
   requires authentication and the current session is unauthenticated, the agent asks Browser
   Session to reuse the platform tab and open its login interface.
2. Once the login interface is visibly ready, the agent stops browser actions and asks the user to
   take over that window. Opening the interface prepares the handoff; it does not authorize the
   agent to enter or submit credentials or verification input.
3. The user completes the login or verification and returns control to the agent.
4. The agent resumes read-only research in the same browser profile and records results through the
   Workspace Service.
5. A later verification request or user-controlled action pauses research and returns control to the
   user again.

Only one actor drives a browser session at a time. Human takeover pauses agent input. Agent control
resumes after the user explicitly returns control; the agent then observes the live page again
before continuing.

Browser Session keeps a dedicated persistent browser profile, stored by default in its
operating-system user-data directory, so cookies and ordinary client state survive between service
runs. Credentials and verification input stay inside the platform window. Job Boardwalk does not
query cookies or browser storage. Browser snapshots omit form-control values and password controls,
and HTTP and MCP responses do not expose authentication cookies or browser profile contents. Browser
Session exposes generic interactions with elements from a recent snapshot and validates the
explicit destination of captured links against the current platform. It does not infer whether a
button, text control, or selection control represents research or an account action; the agent
applies the delegation boundary before acting.

## Access observations

Platform access is an append-only observation stream. Browser Session passively observes navigation
responses the visible browser already receives and applies deterministic adapter rules to bounded
page reads. These are either snapshots requested by the agent or the job-card read already used
for passive job collection. It does not issue a detection request, refresh a page, or open a tab to
check authentication. An adapter with a conclusive navigation rule may use response
success, the final URL, and the server redirect chain to produce one of two authentication results:

- `protected-resource` records `authenticated` when a known protected navigation succeeds;
- `login-redirect` records `unauthenticated` when that navigation redirects to the platform login
  destination.

An adapter may also produce `authenticated-page` when a bounded snapshot contains a complete,
platform-specific set of account controls that establishes an authenticated session. The snapshot
returns the same structured observation so the agent can answer without submitting it again.
Missing or incomplete controls produce no conclusion. Opening a login page directly, route names
alone, display names alone, and cookie presence do not establish authentication.

An explicit job-card snapshot reads the current page without consulting Workspace Service. Its
bounded page evidence may also refresh a conclusive access observation. The separate passive
collector reads the selected intent and its recommendation seed pages from Workspace Service; the
agent may read the same workspace context when explaining the current research direction.

Verification requests and access denial are separate interruptions rather than additional
authentication states. The agent derives those conclusions from visible controls or semantic page
content. No observation includes credentials, cookie values, browser storage, protected response
content, or unrestricted page text.

The Dashboard displays the latest definite authentication observation and any later unresolved
interruption. It includes the observation time rather than presenting historical evidence as a
timeless live guarantee, and it does not open or verify the browser itself.

## Reliable browser research

Browser research should behave like a continuous user-delegated session, not a stateless bulk
fetcher. Execution therefore favors a visible browser and reuse of the selected tab and session
while they remain healthy, low concurrency, and ordinary navigation flow.

Recovery must preserve the platform's visible access decisions. If a platform presents verification
or denies access, the agent reports the interruption and waits for the user; it does not report
denied content as a successful result.

A browser action whose response is lost has an unknown outcome. Browser Session contains that
failure to the request and does not automatically replay the action; after the browser is
restored, the agent re-observes the visible page before deciding whether another action is safe.

## Research reports

Workspace Service stores research reports as Markdown plus structured title, state, timestamps, and
an optional expiration time. A report is a reader-facing interpretation of workspace evidence, not
a replacement for normalized job facts or the underlying platform links. Users, agents, and system
workflows use the same report command and attribution model.

Dashboard renders a deliberately bounded Markdown surface: prose, lists, links, tables, quotes, and
code remain presentation content. It treats raw HTML as text, does not render Markdown images, and
does not provide embedded pages, browser controls, or executable agent UI. An expired report is no
longer returned to readers. A completed report may remain available without requiring the
conversation or producer that created it.

## Dashboard surface

Dashboard has three reader paths:

- the workspace overview for the current job-search intent, personal context, leased Browser
  Session presence, and platform-access observations;
- a paginated job library for normalized job facts and merged platform sources;
- a report library and Markdown reader for conclusions, comparisons, uncertainty, and recommended
  next steps.

### Workspace overview

The overview follows task relevance rather than the order in which capabilities were added. The
selected job-search intent and current personal context form the primary research basis. Browser
and platform status appears in a compact secondary rail and gains visual emphasis only for an
interruption or unavailable runtime. Counts already present in global navigation are not repeated
as overview sections.

Personal context is current research input, not immutable history. The overview initially shows a
bounded read-only summary, and the user can expand every current personal fact in place. A separate
management surface owns creating, revising, selecting, and removing job-search intents and personal
facts. Removing a fact stops it from influencing future interpretation; Workspace Service retains
change attribution separately.

As the product grows, it should also include:

- other research intents;
- research runs, partial progress, and interruptions;
- further report formats and exports when Markdown is no longer sufficient.

Future additions do not change the control boundary: browser interaction and user handoff happen
through the agent conversation and the visible platform window, not through Dashboard controls.
