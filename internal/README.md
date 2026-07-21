# Internal packages

This directory contains private development support for the monorepo.

- [`presets`](presets/) owns TypeScript and Oxlint configuration shared across workspaces.

Add an internal workspace only when repository tooling has a distinct, shared responsibility that
does not belong to a product application or reusable product package.
