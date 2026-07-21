import { glob, readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import path from "node:path";

import { defineConfig } from "vite";
import type { Plugin } from "vite";

const applicationDirectory = import.meta.dirname;
const migrationsDirectory = path.join(applicationDirectory, "migrations");
const minimumMigrationFileCount = 1;

async function migrationSourcePaths(): Promise<string[]> {
  const entries = await Array.fromAsync(
    glob("**/*", {
      cwd: migrationsDirectory,
      withFileTypes: true,
    }),
  );
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .toSorted();
}

function migrationAssetsPlugin(): Plugin {
  return {
    apply: "build",
    async buildStart() {
      const sourcePaths = await migrationSourcePaths();
      if (sourcePaths.length < minimumMigrationFileCount) {
        this.error("Workspace Service 构建需要至少一个数据库迁移文件。");
      }
      await Promise.all(
        sourcePaths.map(async (sourcePath) => {
          const relativePath = path.relative(migrationsDirectory, sourcePath);
          this.addWatchFile(sourcePath);
          this.emitFile({
            fileName: path.posix.join(
              "migrations",
              relativePath.split(path.sep).join(path.posix.sep),
            ),
            source: await readFile(sourcePath),
            type: "asset",
          });
        }),
      );
    },
    name: "workspace-service-migration-assets",
  };
}

export default defineConfig({
  build: {
    lib: {
      entry: { "workspace-service": "main.ts" },
      fileName: (_format, entryName) => `${entryName}.mjs`,
      formats: ["es"],
    },
    outDir: "dist",
    rolldownOptions: {
      external: isBuiltin,
    },
    target: "esnext",
  },
  plugins: [migrationAssetsPlugin()],
  resolve: {
    conditions: ["module", "node", "development|production"],
    mainFields: ["module", "main"],
  },
});
