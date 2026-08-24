# @job-boardwalk/desktop-distribution

## 0.4.1

### Patch Changes

- bda823a: Improve delegated research on BOSS直聘 and Compose builds from source.

  Delegated research on BOSS直聘 now completes same-tab navigation from the platform home page to a
  city jobs page more reliably. The destination page can finish loading so research can continue.

  The supported Dashboard and Workspace Service Compose images now receive the repository's
  dependency fixes when built from source. Each image continues to install only the dependencies it
  needs.

## 0.4.0

### Minor Changes

- 6427243: Add job-description coverage and make delegated browser research more reliable.

  The Dashboard job library now summarizes description coverage for the current search, platform,
  and engagement view. You can filter for jobs with a collected description, all jobs without one,
  or only missing-description jobs that also lack a platform job ID and detail-page link. A new
  tracked view combines interested, contacted, applied, and interviewed jobs in one list while
  preserving each platform record.

  When a collected job is missing a description, platform job ID, and detail-page link, delegated
  research can now associate a confirmed detail page with its existing source. Job Boardwalk
  validates the match before retaining the description instead of guessing from incomplete
  information. The source and its engagement history are preserved. If complete company, title, and
  location evidence matches an existing normalized job, Job Boardwalk merges their sources instead
  of leaving a duplicate.

  Login preparation now checks existing platform tabs before navigating and reuses an authenticated
  session without opening a login page or asking you to take control. When no authenticated page is
  found, Job Boardwalk retains every readable tab that remains on the platform's login route and
  begins browser handoff only after one exposes usable login controls. It leaves unreadable or
  unclassified pages unchanged, including pages that may be showing verification. If no reusable
  login tab remains, it uses an available blank tab or a new tab instead. It also distinguishes a
  navigation timeout from what it can still observe on the resulting page, helping the agent
  reconcile the visible result before choosing a safe next step instead of automatically repeating
  an action whose outcome is uncertain.

  The supported Compose deployment can once again build the Workspace Service and Dashboard images,
  and the Dashboard is again reachable at its documented local address.

## 0.3.0

### Minor Changes

- 56fa349: Remove the separate checksum list and in-directory manifest from portable desktop prereleases.

  GitHub prereleases continue to provide Linux x64 and Windows x64 archives. They no longer include a
  separate `SHA256SUMS` file, and extracted product directories no longer contain `manifest.json`.
  Download the archive for your operating system and extract the complete directory to a writable
  location. On Linux, run `./job-boardwalk`; on Windows, run `job-boardwalk.exe`.

  These archives remain unsigned evaluation builds without automatic updates or a supported backup
  and restore workflow. Keep each version in its own product directory and do not move saved data
  between versions. Compose remains the supported deployment.

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
