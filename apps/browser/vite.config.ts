import { builtinModules } from "node:module";

import { defineConfig } from "vitest/config";

const externalDependencies = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
  "playwright",
]);

export default defineConfig({
  build: {
    lib: {
      entry: "src/cli.ts",
      fileName: "cli",
      formats: ["es"],
    },
    rollupOptions: {
      external: (identifier) => externalDependencies.has(identifier),
    },
    target: "esnext",
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
