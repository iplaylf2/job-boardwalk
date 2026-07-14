# Product design

Job Boardwalk is a local AI job-search secretary. It turns a user's goals into durable, delegated
research: finding opportunities, revisiting sources, organizing evidence, and explaining which
roles merit attention.

This document is the source of truth for cross-application product behavior and boundaries. It
describes the intended product unless a section explicitly states the current implementation.
Application READMEs document only what the software currently exposes and how to operate it.

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
- changing a profile, resume, favorite, follow, or other account state.

A future workflow may automate a precisely defined account action only after that action receives
an explicit authorization model of its own. General research access does not grant that authority.

## Application boundaries

Job Boardwalk separates live browser execution from durable workspace state.

The **Browser Session** owns the visible-browser session protocol and upstream connection
lifecycle. The graphical host owns the browser process, official Playwright Extension, visible
tabs, and profile. Browser Session reaches that host through a configurable MCP endpoint rather
than assuming a particular operating system or display topology. The agent host owns the Browser
Session stdio child process and discovers its tools; Browser Session owns the tool surface and
notifies the host when upstream browser tools become available.

The **Workspace Service** owns recruiting context, research progress, normalized observations, and
analysis. It exposes domain resources and tools to the agent and a read API to the Dashboard. It is
headless and does not own Playwright, browser profiles, authentication cookies, or desktop windows.

The **Dashboard** is an independent view of durable workspace data. It neither controls the browser
nor replaces the agent conversation.

The **agent** coordinates the two service boundaries and owns the human-handoff state in its
conversation with the user. Browser tools produce live evidence; workspace tools preserve the
durable facts and conclusions derived from that evidence. Browser Session may also submit bounded
access observations, such as a visible login page, to the Workspace Service's write API.

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

The graphical host keeps its normal browser profile, so cookies and ordinary client state survive
between sessions. Credentials and verification input stay inside the platform window. Job
Boardwalk HTTP and MCP responses never expose authentication cookies or browser profile contents;
token-bearing extension URLs are redacted at the Browser Session boundary.

## Access observations

Platform access is an append-only observation stream. Browser Session performs one semantic read
per observation request. A workflow may request observations automatically at workflow boundaries,
after meaningful page changes, or during a bounded recovery. Navigation, retries, and necessary
refreshes may also be automated when paced and bounded; tight polling loops and repeated visible
page churn are not part of the workflow. Authentication observations have a definite
`authenticated` or `unauthenticated` result based on platform page evidence; cookie presence alone
does not produce an authentication observation. Verification requests and access denial are
separate interruptions rather than additional authentication states. An observation may include a
display name found on the page, but never credentials, cookie values, or browser storage. Route
names alone do not establish an interruption; visible verification controls or semantic page content
must support that conclusion.

The Dashboard displays the latest definite authentication observation and any later unresolved
interruption. It includes the observation time rather than presenting historical evidence as a
timeless live guarantee, and it does not open or verify the browser itself.

## Reliable browser research

Browser research should behave like a continuous user-delegated session, not a stateless bulk
fetcher. Execution therefore favors a visible browser, reuse of the selected tab and connection
while they remain healthy, low concurrency, and ordinary navigation flow.

Recovery must preserve the platform's visible access decisions. If a platform presents verification
or denies access, the agent reports the interruption and waits for the user; it does not report
denied content as a successful result.

A browser action whose response is lost has an unknown outcome. Browser Session contains that
failure to the request and does not automatically replay the action; after the connection is
restored, the agent re-observes the visible page before deciding whether another action is safe.

## Dashboard read model

The intended Dashboard surface includes:

- confirmed and unconfirmed job-search facts;
- target locations and other research intent;
- research runs, partial progress, and interruptions;
- normalized job observations with sources and freshness;
- agent-produced comparisons and explanations.

Browser interaction and user handoff happen through the agent conversation and the visible platform
window, not through Dashboard controls.

## Current implementation

The Workspace Service currently stores platform-access observations and reads or updates profile
facts and target locations. Its MCP surface currently reads the workspace overview; its HTTP API
also accepts the current write operations.

Browser Session currently acts as a long-lived stdio MCP gateway to a configurable Streamable HTTP
Playwright MCP endpoint on the graphical host. That upstream service connects to an existing Chrome
or Edge profile through the official Playwright Extension. Browser Session supervises one upstream
client at a time, initializes the extension-bound current tab before any browser action, and
reconnects without terminating its downstream MCP surface when the upstream becomes unavailable.
Its stable platform-access tools either open a catalog-owned platform entry or observe the current
page, then report an authenticated, login-required, verification-required, access-denied, or
indeterminate outcome and record definite evidence. Optional raw upstream tools may also be exposed
when the agent host refreshes dynamic discovery, but opening or re-observing platform access does
not depend on them. Automatic writes remain limited to explicitly requested browser-derived access
observations. The agent is responsible for translating recruiting page content into the structured
domain operations accepted by the Workspace Service.

Research-run, run-level interruption, job-result, and analysis persistence are not implemented yet.
They should be introduced as aligned MCP contracts, durable data models, and Dashboard read
models—not as browser primitives or isolated UI state.
