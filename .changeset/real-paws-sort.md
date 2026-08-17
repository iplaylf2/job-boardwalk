---
"@job-boardwalk/desktop-distribution": patch
---

Preserve job descriptions captured during explicit research.

An explicit job-description snapshot on a supported recruiting platform now submits the main
posting description and recognizable job details before returning. The action fails if Workspace
Service rejects the submission, rather than returning evidence that was not preserved.

Workspace Service also ignores older card or description observations that arrive after newer
evidence, so delayed passive collection cannot overwrite an explicit snapshot or move the source's
latest check time backward.
