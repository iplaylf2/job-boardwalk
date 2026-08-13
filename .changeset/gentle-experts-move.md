---
"@job-boardwalk/desktop-distribution": patch
---

Reduce intermittent startup failures in Desktop Manager and protect settings from interrupted
saves.

Desktop Manager now keeps the local address required for service startup reserved until launch
handoff, reducing port conflicts with other processes. It also replaces the settings file
atomically, so saving never exposes a partially written configuration.
