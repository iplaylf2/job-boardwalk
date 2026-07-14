# Packages

- [`platform-catalog`](platform-catalog/) owns stable recruiting-platform identifiers, display
  labels, and browser entry URLs.
- [`contracts`](contracts/) owns product contracts shared by the Workspace Service and its clients.
  It reuses `PlatformId` from the catalog instead of defining a second platform vocabulary.

Applications depend on these packages only for cross-application knowledge. Browser Session owns
the current BOSS research scope; Workspace Service owns persistence and validation. Workflow policy
stays with the application that executes it.
