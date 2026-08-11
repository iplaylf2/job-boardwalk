# Job Boardwalk Desktop

This directory is a pre-release engineering artifact. Keep the complete directory together in a
writable location; Job Boardwalk runs from this directory and stores its data here.

## Start Job Boardwalk

On Linux, open a terminal in this directory and run `./job-boardwalk`. On Windows, run
`job-boardwalk.exe`.

Use Desktop Manager's Start and Stop controls to manage the local services. When they are running,
Desktop Manager displays the Dashboard address and the service log path.

Job Boardwalk uses an installed Chrome, Edge, or Chromium browser and does not bundle or download
one. If automatic discovery does not find a browser, stop the services and select its executable in
Settings.

Docker, Node.js, Caddy, pnpm, Cargo, and a source checkout are not required to run this directory.

## Preserve or remove your data

The `data/` directory contains the workspace database, dedicated browser profile, settings, and
service logs. Use Stop before copying the complete `data/` directory for a backup.

To uninstall this portable build, use Stop, close Desktop Manager, and remove the complete product
directory. Removing it also removes everything under `data/`, so make a backup first if you want to
retain your workspace or browser profile.

## Troubleshooting

Do not rename or move anything under `runtime/` or `payload/`. If a service does not start, use the
service log path shown in Desktop Manager; the default location is `data/logs/services.log`.
