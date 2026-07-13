# Product design

Job Boardwalk is a local AI job-search secretary. It turns a user's job-search goals into durable,
delegated research: finding opportunities, revisiting sources, organizing evidence, and explaining
which roles merit the user's attention.

This document owns the product's target collaboration model. Application READMEs describe what the
current software exposes and how to operate it.

## Delegated research

The user may delegate read-only recruiting research to the agent, including:

- navigating and searching recruiting platforms;
- collecting, refreshing, normalizing, and deduplicating job information;
- comparing opportunities across platforms and against confirmed user goals;
- maintaining a local research record and continuing that work unattended.

An unattended run remains bounded by the user's research intent, the available platform session,
and ordinary interactive pacing. It must preserve partial results and surface interruptions instead
of silently treating incomplete access as complete research.

## User-controlled actions

The user retains control when an action establishes identity, crosses a platform security boundary,
changes account state, or represents the user to another person. This includes:

- entering credentials and completing login or verification challenges;
- submitting or withdrawing applications;
- sending messages or interview responses;
- changing a profile, résumé, favorite, follow, or other account state.

A future workflow may automate a precisely defined account action only after that action receives
an explicit authorization model of its own. General research access does not imply that authority.

## Target browser collaboration

The target browser lifecycle separates control without splitting the session:

1. The runtime opens a visible, persistent platform browser.
2. The user controls login, verification, and other user-controlled actions.
3. The user hands the authenticated session to the agent for delegated research.
4. The agent navigates and reads within the research surface, preserving results locally.
5. A security challenge or user-controlled action pauses research and returns the window to the
   user.

The browser profile remains local so cookies, session continuity, and ordinary client state survive
between runs. Credentials and verification input stay inside the platform window. HTTP and MCP
responses never expose authentication cookies or profile contents.

## Reliable automation

Job Boardwalk should behave like a continuous user-delegated browser session, not a stateless bulk
fetcher. The runtime therefore favors a visible browser, a persistent profile, stable session reuse,
low concurrency, and normal navigation flow. These properties reduce false classification of
ordinary delegated research as bulk crawling and make interruptions recoverable.

Compatibility measures must preserve the platform's observable security decisions. When a platform
presents a verification or access challenge, the runtime reports that state and waits for the user;
it does not report blocked content as a successful result.

## Capability boundary

Agent tools should expose recruiting tasks rather than unrestricted browser primitives. The planned
research surface includes job search, result collection, job-detail reading, refresh, comparison,
and local persistence. It should not expose a general account-action tool or arbitrary page script
execution as part of read-only research.

The current runtime provides workspace reads, browser availability, and visible browser handoff. It
does not yet provide the research tools, browser-control transfer, or job-result storage described
above. Those capabilities should be implemented together so the tool contract, browser ownership,
and durable data model cannot drift apart.
