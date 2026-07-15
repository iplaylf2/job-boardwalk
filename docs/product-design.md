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

The **Workspace Service** owns recruiting context, research progress, normalized observations, and
analysis. It also owns the in-memory presence tracker that applies short leases to Browser Session
runtime reports. It exposes domain resources and tools to the agent and a read API to the Dashboard.
It is headless and does not own browser automation, browser profiles, authentication cookies, or
desktop windows.

The **Dashboard** is an independent view of durable workspace data and leased Browser Session
presence. It neither controls the browser nor requires an active agent conversation.

The **agent** coordinates the two service boundaries and owns the human-handoff state in its
conversation with the user. Browser tools produce live evidence; workspace tools preserve the
durable facts and conclusions derived from that evidence. The agent may submit a justified access
observation to the Workspace Service; Browser Session does not classify or persist page meaning.

Browser Session sends bounded runtime status directly to Workspace Service. A report includes
browser availability, version, and tab count, plus the latest browser error when unavailable.
Workspace Service treats each report as a short lease: before the first report, presence is unknown;
after a lease expires, presence is offline. Reporting failure never prevents Browser Session from
operating. Runtime reports never imply platform authentication and contain no cookies, credentials,
storage contents, or page meaning.

## Browser handoff

The browser lifecycle keeps login visible and user-controlled while preserving the session used
for research:

1. The agent asks Browser Session to open or navigate a visible platform page.
2. If the platform requires login or verification, the agent stops browser actions and asks the
   user to take over that window.
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
and HTTP and MCP responses do not expose authentication cookies or browser profile contents.

## Access observations

Platform access is an append-only observation stream. The agent derives one semantic assessment
from current browser evidence at an observation boundary; Browser Session only supplies the bounded
page snapshot. A workflow may request observations automatically at workflow boundaries, after
meaningful page changes, or during a bounded recovery. Navigation, retries, and necessary refreshes
may also be automated when paced and bounded; tight polling loops and repeated visible page churn
are not part of the workflow.

Authentication observations have a definite `authenticated` or `unauthenticated` result based on
platform page evidence; cookie presence alone does not produce an authentication observation.
Verification requests and access denial are separate interruptions rather than additional
authentication states. An observation may include a display name found on the page, but never
credentials, cookie values, or browser storage. Route names alone do not establish an interruption;
visible verification controls or semantic page content must support that conclusion.

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

## Target Dashboard surface

As the product grows, the Dashboard should include:

- leased presence for local services;
- platform-access observations and unresolved interruptions;
- confirmed and unconfirmed job-search facts;
- target locations and other research intent;
- research runs, partial progress, and interruptions;
- normalized job observations with sources and freshness;
- agent-produced comparisons and explanations.

These additions do not change the control boundary: browser interaction and user handoff happen
through the agent conversation and the visible platform window, not through Dashboard controls.
