import path from "node:path";

import { defineConfig } from "vite";

function isPackageImport(identifier: string): boolean {
  return (
    !identifier.startsWith(".") && !identifier.startsWith("\0") && !path.isAbsolute(identifier)
  );
}

export default defineConfig({
  build: {
    lib: {
      entry: {
        "browser-session-server": "src/browser-session-server.ts",
      },
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ["es"],
    },
    outDir: "dist",
    rollupOptions: {
      external: isPackageImport,
    },
    target: "esnext",
  },
});
