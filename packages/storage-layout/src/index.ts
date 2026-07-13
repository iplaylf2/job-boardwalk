import path from "node:path";
import process from "node:process";
import { chmod, mkdir } from "node:fs/promises";

import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

const privateDirectoryMode = 0o700;
const defaultStorageRoot = path.resolve(import.meta.dirname, "../../../.job-boardwalk");

function getStorageRoot(): string {
  const configuredRoot = process.env["JOB_BOARDWALK_HOME"];
  return configuredRoot ? path.resolve(configuredRoot) : defaultStorageRoot;
}

export function getWorkspaceDirectory(): string {
  return path.join(getStorageRoot(), "workspace");
}

export function getBrowserSessionDirectory(): string {
  return path.join(getStorageRoot(), "browser-session");
}

export function* preparePrivateDirectory(directoryPath: string): RiteCoroutine<void> {
  yield* until(() => mkdir(directoryPath, { mode: privateDirectoryMode, recursive: true }));
  yield* until(() => chmod(directoryPath, privateDirectoryMode));
}

export function* prepareWorkspaceStorage(): RiteCoroutine<void> {
  const storageRoot = getStorageRoot();
  yield* preparePrivateDirectory(storageRoot);
  yield* preparePrivateDirectory(getWorkspaceDirectory());
}
