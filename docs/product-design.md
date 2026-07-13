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

The user retains control when an action establishes identity, crosses a platform security boundary,
changes account state, or represents the user to another person. This includes:

- entering credentials and completing login or verification challenges;
- submitting or withdrawing applications;
- sending messages or interview responses;
- changing a profile, resume, favorite, follow, or other account state.

A future workflow may automate a precisely defined account action only after that action receives
an explicit authorization model of its own. General research access does not grant that authority.

## Application boundaries

Job Boardwalk separates live browser execution from durable workspace state.

The **Browser Session** directly owns Playwright, a visible browser, and a dedicated persistent
profile in an environment with access to the user's graphical session. Its Playwright MCP surface
lets the agent operate that same browser context; MCP does not own a second browser. Browser Session
may run beside the agent or behind an authenticated local transport reachable across a sandbox or
container boundary.

The **Workspace Service** owns recruiting context, research progress, normalized observations, and
analysis. It exposes domain resources and tools to the agent and a read API to the Dashboard. It is
headless and does not own Playwright, browser profiles, authentication cookies, or desktop windows.

The **Dashboard** is an independent view of durable workspace data. It neither controls the browser
nor replaces the agent conversation.

The **agent** coordinates the two service boundaries. Browser tools produce live evidence;
workspace tools preserve the durable facts and conclusions derived from that evidence. Browser
Session may also submit bounded access observations, such as a visible login page, to the Workspace
Service's write API.

## Browser handoff

The browser lifecycle keeps login visible and user-controlled while preserving the session used
for research:

1. The agent asks Browser Session to open or navigate a visible platform page.
2. If the platform requires login or verification, the agent stops browser actions and asks the
   user to complete the challenge in that window.
3. The user completes the platform-controlled interaction and returns control to the agent.
4. The agent resumes read-only research in the same browser profile and records results through the
   Workspace Service.
5. A later security challenge or user-controlled action pauses research and returns control to the
   user again.

Only one actor drives a browser session at a time. Human takeover pauses agent input. Agent control
resumes only after user acknowledgement or a fresh observation that the blocking condition has
cleared.

Browser Session keeps its profile on the machine that runs the visible browser, so cookies and
ordinary client state survive between sessions. Credentials and verification input stay inside the
platform window. Job Boardwalk HTTP and MCP responses never expose authentication cookies or
browser profile contents.

## Access observations

Platform access is an append-only observation stream, not a mutable `loggedIn` flag. Cookie
presence produces `authentication-unverified`; confirmed authentication requires platform-specific
page evidence. An observation may include a display name found on the page, but never credentials,
cookie values, or browser storage.

The Dashboard may display a durable interruption or the time and outcome of the most recent browser
observation. It must not present historical evidence as the platform's current authentication
state, and it does not open or verify the browser itself.

## Reliable browser research

Browser research should behave like a continuous user-delegated session, not a stateless bulk
fetcher. Execution therefore favors a visible browser, a dedicated persistent profile, stable
session reuse, low concurrency, and ordinary navigation flow.

Compatibility measures must preserve the platform's observable security decisions. When a platform
presents verification or denies access, the agent reports the interruption and waits for the user;
it does not report blocked content as a successful result.

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

Browser Session owns Playwright and exposes its browser capabilities through MCP. Its automatic
writes are limited to browser-derived access observations. The agent is responsible for translating
recruiting page content into the structured domain operations accepted by the Workspace Service.

Research-run, interruption, job-result, and analysis persistence are not implemented yet. They
should be introduced as aligned MCP contracts, durable data models, and Dashboard read models—not
as browser primitives or isolated UI state.
