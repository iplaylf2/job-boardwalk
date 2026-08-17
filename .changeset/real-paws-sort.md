---
"@job-boardwalk/desktop-distribution": patch
---

Preserve job descriptions captured during explicit research.

An explicit job-description snapshot on a supported recruiting platform now returns its captured
description and recognizable job facts only after Workspace Service accepts and retains the
observation. A rejected write or a `stale` outcome fails the action.

Workspace Service also retains freshness independently for card and description evidence. A later
matching observation refreshes the retained evidence and is reported as `source-updated` when that
refresh changes the normalized job's derived facts. Older evidence and conflicting observations at
the same timestamp remain unapplied, so delayed passive collection cannot overwrite an explicit
snapshot or move the source's latest check time backward.
