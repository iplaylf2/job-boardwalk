---
"@job-boardwalk/desktop-distribution": patch
---

Preserve job descriptions captured during explicit research.

An explicit job-description snapshot on a supported recruiting platform now returns the main
posting description and recognizable job facts only after Workspace Service confirms that the
captured evidence is preserved. The action fails if the service rejects the submission or leaves
it unapplied as `stale`, rather than returning evidence that was not preserved.

Workspace Service also retains freshness independently for card and description evidence. A later
matching observation refreshes that evidence without recording a content change, while an older or
conflicting observation with the same timestamp is left unapplied. Delayed passive collection
therefore cannot overwrite an explicit snapshot or move the source's latest check time backward.
