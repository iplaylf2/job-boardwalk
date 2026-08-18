---
"@job-boardwalk/desktop-distribution": minor
---

Remove the separate checksum list and in-directory manifest from portable desktop prereleases.

GitHub prereleases continue to provide Linux x64 and Windows x64 archives. They no longer include a
separate `SHA256SUMS` file, and extracted product directories no longer contain `manifest.json`.
Download the archive for your operating system and extract the complete directory to a writable
location. On Linux, run `./job-boardwalk`; on Windows, run `job-boardwalk.exe`.

These archives remain unsigned evaluation builds without automatic updates or a supported backup
and restore workflow. Keep each version in its own product directory and do not move saved data
between versions. Compose remains the supported deployment.
