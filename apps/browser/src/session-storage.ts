import path from "node:path";
import { chmod, mkdir } from "node:fs/promises";

import type { PlatformName } from "./platforms.js";

const privateDirectoryMode = 0o700;
const sessionStorageDirectory = path.resolve(import.meta.dirname, "../../../.auth");

async function prepareSessionStorageDirectory(): Promise<void> {
  await mkdir(sessionStorageDirectory, { mode: privateDirectoryMode, recursive: true });
  await chmod(sessionStorageDirectory, privateDirectoryMode);
}

export async function prepareBrowserProfileDirectory(platform: PlatformName): Promise<string> {
  await prepareSessionStorageDirectory();
  const profilePath = path.join(sessionStorageDirectory, `${platform}-profile`);
  await mkdir(profilePath, { mode: privateDirectoryMode, recursive: true });
  await chmod(profilePath, privateDirectoryMode);
  return profilePath;
}

export function getLoginReceiptPath(platform: PlatformName): string {
  return path.join(sessionStorageDirectory, `${platform}-login-receipt.json`);
}
