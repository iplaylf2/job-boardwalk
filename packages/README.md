# Packages

- [`platform-catalog`](platform-catalog/) owns stable recruiting-platform identifiers, display
  labels, canonical web origins, navigation domains, and destination paths.
- [`contracts`](contracts/) owns executable ArkType product contracts shared across applications.
  Each runtime schema is the source of its exported TypeScript type, and it reuses the catalog's
  platform identifiers instead of defining a second platform vocabulary.
- [`desktop-product-layout`](desktop-product-layout/) owns the relative and resolved path contract
  shared by the desktop runtime and distribution assembler.

Packages expose stable shared contracts and metadata. Application workflow, persistence, browser
ownership, and build orchestration stay with their owning applications or internal tools; those
components document their own boundaries.
