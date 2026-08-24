---
"@job-boardwalk/desktop-distribution": patch
---

Improve delegated research on BOSS直聘 and Compose builds from source.

Delegated research on BOSS直聘 now completes same-tab navigation from the platform home page to a
city jobs page more reliably. The destination page can finish loading so research can continue.

The supported Dashboard and Workspace Service Compose images now receive the repository's
dependency fixes when built from source. Each image continues to install only the dependencies it
needs.
