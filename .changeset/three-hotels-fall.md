---
"@job-boardwalk/desktop-distribution": patch
---

Keep Desktop Manager content visible on Windows and show when recruiting-platform access was most
recently observed.

Desktop Manager now preserves previously displayed content during Windows window and compositor
updates. Dashboard timestamps the displayed authentication or access interruption by its most
recent observation, including repeated observations that reach the same conclusion.
