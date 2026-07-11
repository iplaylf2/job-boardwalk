# job-boardwalk

Job Boardwalk explores human–AI agent collaboration in job browsing across recruiting
platforms.

Recruiting platforms represent similar information and interactions in different ways. The
project asks how an agent can help a person browse more effectively across those platforms,
and how their differences can be modeled consistently without erasing what is specific to
each one.

## Scope

The intended setting is human-directed browsing: an agent assists a person who is actively
interacting with recruiting platforms. This differs from unattended crawling or bulk data
collection. The project does not aim to bypass access controls, evade rate limits or
platform restrictions, or operate outside applicable terms.

The concrete interaction model, shared concepts, platform integrations, and application
shape remain open. They will emerge from implementation work and observed needs rather
than being fixed by the initial repository structure.

## Current status

This repository currently establishes a pnpm-managed TypeScript monorepo and its shared
development checks. Product workspaces and their responsibilities will be introduced as
the project takes shape.

## Development

```sh
pnpm install
pnpm check
```

Root commands run the checks supported by the current workspaces.
