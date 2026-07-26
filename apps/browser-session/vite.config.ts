import { isBuiltin } from "node:module";

import { defineConfig } from "vite";
import type { Plugin } from "vite";

const unsupportedChromiumBidiModule = "\0job-boardwalk-unsupported-chromium-bidi";

function excludeUnsupportedChromiumBidi(): Plugin {
  return {
    load(identifier) {
      if (identifier === unsupportedChromiumBidiModule) {
        return "export default {};";
      }
      return null;
    },
    name: "exclude-unsupported-chromium-bidi",
    resolveId(identifier) {
      if (identifier.startsWith("chromium-bidi/")) {
        return unsupportedChromiumBidiModule;
      }
      return null;
    },
  };
}

export default defineConfig({
  build: {
    lib: {
      entry: {
        "browser-session": "src/main.ts",
      },
      fileName: (_format, entryName) => `${entryName}.cjs`,
      formats: ["cjs"],
    },
    outDir: "dist",
    rolldownOptions: {
      external: isBuiltin,
    },
    target: "esnext",
  },
  plugins: [excludeUnsupportedChromiumBidi()],
  resolve: {
    conditions: ["module", "node", "development|production"],
    mainFields: ["module", "main"],
  },
});
