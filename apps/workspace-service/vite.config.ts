import path from "node:path";

import { defineConfig } from "vite";

function isPackageImport(identifier: string): boolean {
  return (
    !identifier.startsWith(".") &&
    !identifier.startsWith("\0") &&
    !identifier.startsWith("#/") &&
    !path.isAbsolute(identifier)
  );
}

export default defineConfig({
  build: {
    lib: {
      entry: { "workspace-service-server": "src/workspace-service-server.ts" },
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
