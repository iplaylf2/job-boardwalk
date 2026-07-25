import { isBuiltin } from "node:module";

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/main.ts",
      fileName: () => "application-runtime.cjs",
      formats: ["cjs"],
    },
    outDir: "dist",
    rolldownOptions: {
      external: isBuiltin,
    },
    target: "esnext",
  },
  resolve: {
    conditions: ["module", "node", "development|production"],
    mainFields: ["module", "main"],
  },
});
