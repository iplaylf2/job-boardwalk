import path from "node:path";
import { chmod, mkdir } from "node:fs/promises";

import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

import type { PlatformName } from "./platforms.js";

const privateDirectoryMode = 0o700;
const sessionStorageDirectory = path.resolve(import.meta.dirname, "../../../.auth");

function* prepareSessionStorageDirectory() {
  yield* until(() =>
    mkdir(sessionStorageDirectory, { mode: privateDirectoryMode, recursive: true }),
  );
  yield* until(() => chmod(sessionStorageDirectory, privateDirectoryMode));
}

export function* prepareBrowserProfileDirectory(platform: PlatformName): RiteCoroutine<string> {
  yield* prepareSessionStorageDirectory();
  const profilePath = path.join(sessionStorageDirectory, `${platform}-profile`);
  yield* until(() => mkdir(profilePath, { mode: privateDirectoryMode, recursive: true }));
  yield* until(() => chmod(profilePath, privateDirectoryMode));
  return profilePath;
}

export function getLoginReceiptPath(platform: PlatformName): string {
  return path.join(sessionStorageDirectory, `${platform}-login-receipt.json`);
}
