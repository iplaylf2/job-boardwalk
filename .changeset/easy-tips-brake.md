---
"@job-boardwalk/desktop-distribution": patch
---

Restore Browser Session startup when Desktop Manager automatically detects Google Chrome or
Microsoft Edge.

The fix only changes how automatically detected Chrome and Edge installations are started;
manually selected browsers and automatically detected Chromium installations are unaffected. Edge
may still warn about an unsupported command-line flag. That warning is expected and does not by
itself indicate a Browser Session failure.
