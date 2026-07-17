# Packages

- [`platform-catalog`](platform-catalog/) owns stable recruiting-platform identifiers, display
  labels, canonical web origins, navigation domains, and destination paths.
- [`contracts`](contracts/) owns executable ArkType product contracts shared across applications.
  Each runtime schema is the source of its exported TypeScript type, and it reuses the catalog's
  platform identifiers instead of defining a second platform vocabulary.

Applications depend on these packages only for cross-application product contracts. Browser Session
owns the recruiting-platform adapter registry, shared navigation workflow, and browser profile.
Workspace Service enforces contracts at its HTTP boundary and owns database, persistence, domain
normalization, and validation policy. Reading applications validate untrusted service responses
with the same contracts. Workflow policy stays with the application that executes it.
