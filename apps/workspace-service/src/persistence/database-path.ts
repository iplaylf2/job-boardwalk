import path from "node:path";
import process from "node:process";
import { existsSync } from "node:fs";
import { chmod, mkdir } from "node:fs/promises";

import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

const privateDirectoryMode = 0o700;

function resolveRepositoryRoot(): string {
  const candidates = [
    path.resolve(import.meta.dirname, "../../.."),
    path.resolve(import.meta.dirname, "../../../.."),
  ];
  const repositoryRoot = candidates.find((candidate) =>
    existsSync(path.join(candidate, "pnpm-workspace.yaml")),
  );
  if (!repositoryRoot) {
    throw new Error("找不到 Job Boardwalk 仓库根目录");
  }
  return repositoryRoot;
}

function resolveStorageRoot(): string {
  const configuredRoot = process.env["JOB_BOARDWALK_HOME"];
  return configuredRoot
    ? path.resolve(configuredRoot)
    : path.join(resolveRepositoryRoot(), ".job-boardwalk");
}

function* preparePrivateDirectory(directoryPath: string): RiteCoroutine<void> {
  yield* until(() => mkdir(directoryPath, { mode: privateDirectoryMode, recursive: true }));
  yield* until(() => chmod(directoryPath, privateDirectoryMode));
}

export function* prepareWorkspaceDatabasePath(): RiteCoroutine<string> {
  const storageRoot = resolveStorageRoot();
  const workspaceDirectory = path.join(storageRoot, "workspace");
  yield* preparePrivateDirectory(storageRoot);
  yield* preparePrivateDirectory(workspaceDirectory);
  return path.join(workspaceDirectory, "workspace.sqlite");
}
