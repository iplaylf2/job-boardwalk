# Internal packages

This directory contains private development support for the monorepo.

- [`presets`](presets/) owns TypeScript and Oxlint configuration shared across workspaces.
- [`desktop-distribution`](desktop-distribution/) coordinates the desktop-product build boundary:
  product-tree assembly, integrity metadata, and native archive construction.

Internal workspaces are private repository tools, not product runtime dependencies. Add one only
when its responsibility does not belong to an application or reusable product package.
