import { builtinModules } from "node:module";

import { defineConfig } from "vite";

const externalDependencies = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
  "@hono/node-server",
  "@job-boardwalk/storage-layout",
  "@job-boardwalk/platforms",
  "@job-boardwalk/state-api",
  "@shajara/host",
  "@shajara/host/primitives",
  "hono",
]);

export default defineConfig({
  build: {
    lib: {
      entry: "src/main.ts",
      fileName: "main",
      formats: ["es"],
    },
    outDir: "dist",
    rollupOptions: {
      external: (identifier) => externalDependencies.has(identifier),
    },
    target: "esnext",
  },
});
