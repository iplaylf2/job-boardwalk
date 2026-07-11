# Internal packages

This directory contains private development support for the monorepo.

- [`presets`](presets/) owns TypeScript and Oxlint configuration shared across workspaces.

Add another internal workspace only when repository tooling has a distinct responsibility that
does not belong to a product application or reusable product package.
