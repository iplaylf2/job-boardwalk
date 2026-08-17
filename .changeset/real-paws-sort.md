---
"@job-boardwalk/desktop-distribution": patch
---

Preserve job descriptions captured during explicit research.

An explicit job-description snapshot on a supported recruiting platform now returns the main
posting description and recognizable job details only after Workspace Service confirms that the
captured evidence is preserved. The action fails if the service rejects the submission or reports
it as stale without applying it, rather than returning evidence that was not preserved.

Workspace Service also ignores older card or description observations that arrive after newer
evidence, so delayed passive collection cannot overwrite an explicit snapshot or move the source's
latest check time backward.
