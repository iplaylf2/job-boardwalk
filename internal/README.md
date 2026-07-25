# Internal packages

This directory contains private development support for the monorepo.

- [`presets`](presets/) owns TypeScript and Oxlint configuration shared across workspaces.
- [`desktop-distribution`](desktop-distribution/) coordinates the desktop-product build boundary:
  product-tree assembly, integrity metadata, and platform packaging. It is a private build tool,
  not an application runtime dependency.

Add an internal workspace only when repository tooling has a distinct, shared responsibility that
does not belong to a product application or reusable product package.
