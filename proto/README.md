# Product Protocols

This directory owns Job Boardwalk's language-neutral product protocols. Protocol Buffers schemas
define message cardinality, enums, extensible `oneof` variants, stable field numbers, and
compatibility policy. Buf validates schemas and generates language-native consumers; applications
do not maintain parallel handwritten wire models.

## Desktop lifecycle

[`desktop_lifecycle.proto`](job_boardwalk/desktop_lifecycle/v1/desktop_lifecycle.proto) defines the
bounded, versioned protocol between Desktop Manager and Desktop Runtime. The transport is a
stream of length-delimited Protobuf messages over the runtime child process's standard input and
output. Runtime logs use stderr.

Generate Rust and TypeScript consumers with:

```sh
pnpm exec moon run product-protocols:generate
```

Validate the schema with:

```sh
pnpm exec moon run product-protocols:test
```

`buf.gen.yaml` is the only generator configuration. The TypeScript drift check invokes that
configuration in a temporary mirrored workspace and compares its output without rewriting either
application's checked-in consumers; it does not duplicate plugin versions or generation options.

The package name carries the major protocol generation. Compatible additions retain field numbers
and add fields, enum values, or `oneof` variants. Removed fields and enum values are reserved rather
than reused. A deliberate breaking protocol starts a new package generation.
