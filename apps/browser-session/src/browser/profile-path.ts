import path from "node:path";
import process from "node:process";
import { homedir } from "node:os";
import { chmod, mkdir } from "node:fs/promises";

import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

const privateDirectoryMode = 0o700;

function defaultUserDataRoot(
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  homeDirectory: string,
): string {
  if (platform === "win32") {
    return environment["LOCALAPPDATA"]?.trim() || path.join(homeDirectory, "AppData", "Local");
  }
  if (platform === "darwin") {
    return path.join(homeDirectory, "Library", "Application Support");
  }
  const xdgDataHome = environment["XDG_DATA_HOME"]?.trim();
  return xdgDataHome && path.isAbsolute(xdgDataHome)
    ? xdgDataHome
    : path.join(homeDirectory, ".local", "share");
}

export function resolveBrowserProfilePath(
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  homeDirectory: string = homedir(),
): string {
  const configuredPath = environment["JOB_BOARDWALK_BROWSER_PROFILE_PATH"]?.trim();
  return configuredPath
    ? path.resolve(configuredPath)
    : path.join(
        defaultUserDataRoot(environment, platform, homeDirectory),
        "job-boardwalk",
        "browser-session",
        "profile",
      );
}

export function* prepareBrowserProfilePath(): RiteCoroutine<string> {
  const profilePath = resolveBrowserProfilePath();
  yield* until(() => mkdir(profilePath, { mode: privateDirectoryMode, recursive: true }));
  yield* until(() => chmod(profilePath, privateDirectoryMode));
  return profilePath;
}
