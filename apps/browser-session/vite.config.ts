import { isBuiltin } from "node:module";
import path from "node:path";

import { defineConfig } from "vite";

function isRuntimeDependency(identifier: string): boolean {
  return (
    isBuiltin(identifier) ||
    (!identifier.startsWith(".") &&
      !identifier.startsWith("#") &&
      !identifier.startsWith("\0") &&
      !identifier.startsWith("@job-boardwalk/") &&
      !path.isAbsolute(identifier))
  );
}

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: "src/main.ts",
      },
      fileName: (_format, entryName) => `${entryName}.cjs`,
      formats: ["cjs"],
    },
    outDir: "dist",
    rolldownOptions: {
      external: isRuntimeDependency,
    },
    target: "esnext",
  },
  resolve: {
    conditions: ["module", "node", "development|production"],
    mainFields: ["module", "main"],
  },
});
