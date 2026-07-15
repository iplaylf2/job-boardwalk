# Packages

- [`platform-catalog`](platform-catalog/) owns stable recruiting-platform identifiers, display
  labels, canonical web origins, navigation domains, and destination paths.
- [`contracts`](contracts/) owns product contracts shared across applications. It reuses
  `PlatformId` from the catalog instead of defining a second platform vocabulary.

Applications depend on these packages only for cross-application product contracts. Browser Session
owns the recruiting-platform adapter registry, shared navigation workflow, and browser profile;
Workspace Service owns its database, persistence, and validation. Workflow policy stays with the
application that executes it.
