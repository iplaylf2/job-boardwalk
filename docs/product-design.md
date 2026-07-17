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
observations, and their persistence. It also owns the in-memory presence tracker that applies short
leases to Browser Session runtime reports. It exposes domain resources and tools to the agent and a
local API to the Dashboard. It is headless and does not own browser automation, browser profiles,
authentication cookies, or desktop windows.

The **Dashboard** is an independent view of durable workspace data and leased Browser Session
presence. It also lets the user maintain personal context and a collection of job-search intents.
At most one intent is selected as the current collection context; each intent associates a
target position and city with its corresponding platform recommendation pages. Dashboard neither
controls the browser nor requires an active agent conversation.

The **agent** coordinates the two service boundaries and owns the human-handoff state in its
conversation with the user. Browser tools produce live evidence; workspace tools preserve the
durable facts and conclusions derived from that evidence. A Browser Session adapter may derive an
authentication assessment from a real top-level navigation response or a bounded page snapshot
when it has a conclusive platform-specific rule. The agent interprets evidence not covered by an
adapter.

Browser Session may also expose a bounded, platform-specific recommendation-page snapshot as live
evidence. It verifies that the live page is a supported BOSS直聘 intent feed or 鱼泡直聘 topic feed
before extracting already-loaded job cards. Browser Session does not own the selected intent,
recommendation-page association, recommendation-quality judgments, or durable observations.
Workspace Service owns the durable context. The selected intent determines which associated
recommendation pages Browser Session reads passively.

Collected and normalized jobs form a separate durable library rather than a page archive. Each
platform source keeps its job and discovery links plus normalized fields; no HTML or historical
page snapshot is stored. Workspace Service merges sources when their normalized company, title,
and location identify the same job. An observation fingerprint skips unchanged records. Partial
cards without that identity remain separate.

Browser Session sends bounded status directly to Workspace Service. A report includes browser
availability, version, and tab count, plus a generic failure summary when unavailable and any
platform authentication observations derived from navigation responses or bounded snapshots.
Detailed browser errors remain in the Browser Session process log so status reports do not expose
local paths or launch parameters. Workspace Service treats runtime status as a short lease and
stores only changed access observations: before the first report, presence is unknown; after a
lease expires, presence is offline. Reporting failure never prevents Browser Session from
operating. Reports contain no cookies, credentials, storage contents, or unrestricted page text.

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
page reads. These are either snapshots requested by the agent or the recommendation-page read
already used for passive job collection. It does not issue a detection request, refresh a page, or
open a tab to check authentication. An adapter with a conclusive navigation rule may use response
success, the final URL, and the server redirect chain to produce one of two authentication results:

- `protected-resource` records `authenticated` when a known protected navigation succeeds;
- `login-redirect` records `unauthenticated` when that navigation redirects to the platform login
  destination.

An adapter may also produce `authenticated-page` when a bounded snapshot contains a complete,
platform-specific set of account controls that establishes an authenticated session. The snapshot
returns the same structured observation so the agent can answer without submitting it again.
Missing or incomplete controls produce no conclusion. Opening a login page directly, route names
alone, display names alone, and cookie presence do not establish authentication.

Recommendation-page reads classify and extract the current page without consulting Workspace
Service. Their bounded page evidence may also refresh a conclusive access observation. The agent
may read the selected intent and its platform recommendation pages from Workspace when explaining
the current recommendation context.

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

## Dashboard surface

The Dashboard currently includes:

- leased Browser Session presence;
- platform-access observations and unresolved interruptions;
- user-editable personal details and selectable job-search intents with platform recommendation
  pages;
- a dedicated, paginated job-library workspace for normalized page facts and merged platform
  sources.

As the product grows, it should also include:

- other research intents;
- research runs, partial progress, and interruptions;
- broader comparisons and explanations across the job library.

Future additions do not change the control boundary: browser interaction and user handoff happen
through the agent conversation and the visible platform window, not through Dashboard controls.
