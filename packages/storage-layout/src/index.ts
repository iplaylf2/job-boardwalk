import path from "node:path";
import process from "node:process";
import { chmod, mkdir } from "node:fs/promises";

import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { all, wait } from "@shajara/host/primitives";

const privateDirectoryMode = 0o700;
const defaultStorageRoot = path.resolve(import.meta.dirname, "../../../.job-boardwalk");

export function getStorageRoot(): string {
  const configuredRoot = process.env["JOB_BOARDWALK_HOME"];
  return configuredRoot ? path.resolve(configuredRoot) : defaultStorageRoot;
}

export function getAuthenticationDirectory(): string {
  return path.join(getStorageRoot(), "auth");
}

export function getDataDirectory(): string {
  return path.join(getStorageRoot(), "data");
}

export function* preparePrivateDirectory(directoryPath: string): RiteCoroutine<void> {
  yield* until(() => mkdir(directoryPath, { mode: privateDirectoryMode, recursive: true }));
  yield* until(() => chmod(directoryPath, privateDirectoryMode));
}

export function* prepareStorageLayout(): RiteCoroutine<void> {
  const storageRoot = getStorageRoot();
  yield* preparePrivateDirectory(storageRoot);
  const preparedDirectories = yield* all([
    () => preparePrivateDirectory(getAuthenticationDirectory()),
    () => preparePrivateDirectory(getDataDirectory()),
    () => preparePrivateDirectory(path.join(storageRoot, "artifacts")),
    () => preparePrivateDirectory(path.join(storageRoot, "runtime")),
  ]);
  yield* wait(preparedDirectories);
}
