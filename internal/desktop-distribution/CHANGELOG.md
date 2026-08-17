# @job-boardwalk/desktop-distribution

## 0.2.3

### Patch Changes

- 2fccf76: Keep Desktop Manager content visible on Windows and show when recruiting-platform access was most
  recently observed.

  Desktop Manager now preserves previously displayed content during Windows window and compositor
  updates. Dashboard timestamps the displayed authentication or access interruption by its most
  recent observation, including repeated observations that reach the same conclusion.

## 0.2.2

### Patch Changes

- db271e8: Restore Browser Session startup when Desktop Manager automatically detects Google Chrome or
  Microsoft Edge.

  The fix only changes how automatically detected Chrome and Edge installations are started;
  manually selected browsers and automatically detected Chromium installations are unaffected. Edge
  may still warn about an unsupported command-line flag. That warning is expected and does not by
  itself indicate a Browser Session failure.

## 0.2.1

### Patch Changes

- ac9af66: Reduce intermittent startup failures in Desktop Manager and protect settings from interrupted
  saves.

  Desktop Manager now keeps the local address required for service startup reserved until launch
  handoff, reducing port conflicts with other processes. It also replaces the settings file
  atomically, so saving never exposes a partially written configuration.

## 0.2.0

### Minor Changes

- ea6d6e5: Add portable prerelease desktop builds for Linux x64 and Windows x64.

  Job Boardwalk can now run from a self-contained directory without installing Docker or Node.js and
  without a source checkout. Desktop Manager starts and stops the local services, distinguishes core
  availability from the optional browser capability, and shows the Dashboard address and service log
  location.

  The desktop build uses an installed Chrome, Edge, or Chromium browser and keeps the workspace
  database, dedicated browser profile, settings, and logs under `data/` in the product directory.
  These archives are unsigned prerelease builds and do not yet provide automatic updates or a
  supported backup, restore, or cross-version migration workflow. The existing Compose deployment
  remains the supported way to run Job Boardwalk.
