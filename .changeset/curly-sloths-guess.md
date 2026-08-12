---
"@job-boardwalk/desktop-distribution": minor
---

Add portable prerelease desktop builds for Linux x64 and Windows x64.

Job Boardwalk can now run from a self-contained directory without installing Docker or Node.js and
without a source checkout. Desktop Manager starts and stops the local services, reports their
status, and shows the Dashboard address and service log location.

The desktop build uses an installed Chrome, Edge, or Chromium browser and keeps the workspace
database, dedicated browser profile, settings, and logs under `data/` in the product directory.
These archives are unsigned prerelease builds and do not yet provide automatic updates or a
supported backup, restore, or cross-version migration workflow. The existing Compose deployment
remains the supported way to run Job Boardwalk.
