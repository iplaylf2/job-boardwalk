# @job-boardwalk/desktop-distribution

## 0.2.4

### Patch Changes

- 1400e25: Preserve job descriptions captured during explicit research.

  An explicit job-description snapshot on a supported recruiting platform now returns its captured
  description and recognizable job facts only after Workspace Service accepts and retains the
  observation. A rejected write or a `stale` outcome fails the action.

  Workspace Service also retains freshness independently for card and description evidence. A later
  matching observation refreshes the retained evidence and is reported as `source-updated` when that
  refresh changes the normalized job's derived facts. Older evidence and conflicting observations at
  the same timestamp remain unapplied, so delayed passive collection cannot overwrite an explicit
  snapshot or move the source's latest check time backward.

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
