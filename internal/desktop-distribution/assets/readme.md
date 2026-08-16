# Job Boardwalk Desktop

This directory contains an unsigned prerelease build. Keep the complete directory together in a
writable location; Job Boardwalk runs from this directory and stores its data here. The operating
system may warn before opening an unsigned application.

## Start Job Boardwalk

On Linux, open a terminal in this directory and run `./job-boardwalk`. On Windows, run
`job-boardwalk.exe`.

Use Desktop Manager's Start and Stop controls to manage the local services. When they are running,
Desktop Manager displays the Dashboard address and the service log path.

Job Boardwalk uses an installed Chrome, Edge, or Chromium browser and does not bundle or download
one. If automatic discovery does not find a browser, stop the services and select its executable in
Settings. If browser access remains unavailable, inspect the service log. Use another Chrome, Edge,
or Chromium installation only when the log identifies the selected browser as incompatible.

Edge may warn that `--disable-blink-features=AutomationControlled` is an unsupported command-line
flag. Patchright includes that switch in the dedicated browser's launch configuration, so the warning
is expected and does not by itself indicate a Browser Session failure. Job Boardwalk leaves the
warning visible and keeps the browser process sandbox enabled.

Docker and development tools are not required to run this directory.

## Preserve or remove your data

The `data/` directory contains the workspace database, dedicated browser profile, settings, and
service logs. Use Stop before copying the complete `data/` directory as a precautionary backup.
This prerelease does not provide a supported restore or cross-version migration workflow. Do not
copy saved data into another version unless its release notes explicitly declare compatibility.

To uninstall this portable build, use Stop, close Desktop Manager, and remove the complete product
directory. Removing it also removes everything under `data/`.

## Troubleshooting

Do not rename or move anything under `runtime/` or `payload/`. If a service does not start, use the
service log path shown in Desktop Manager; the default location is `data/logs/services.log`.
