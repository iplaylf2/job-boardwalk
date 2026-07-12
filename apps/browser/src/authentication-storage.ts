import path from "node:path";

import {
  getAuthenticationDirectory,
  preparePrivateDirectory,
  prepareStorageLayout,
} from "@job-boardwalk/storage-layout";
import type { RiteCoroutine } from "@shajara/host";

import type { PlatformName } from "@job-boardwalk/platforms";

function* prepareAuthenticationStorage() {
  yield* prepareStorageLayout();
}

export function* prepareBrowserProfileDirectory(platform: PlatformName): RiteCoroutine<string> {
  yield* prepareAuthenticationStorage();
  const profilePath = path.join(getAuthenticationDirectory(), `${platform}-profile`);
  yield* preparePrivateDirectory(profilePath);
  return profilePath;
}

export function getLoginReceiptPath(platform: PlatformName): string {
  return path.join(getAuthenticationDirectory(), `${platform}-login-receipt.json`);
}
