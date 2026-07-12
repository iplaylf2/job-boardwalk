import path from "node:path";
import { readFile, stat } from "node:fs/promises";

import { getAuthenticationDirectory } from "@job-boardwalk/storage-layout";
import { platformCatalog, platformNames } from "@job-boardwalk/platforms";
import type { LoginReceipt, PlatformName } from "@job-boardwalk/platforms";
import type { PlatformLoginStatus, WorkspaceOverview } from "@job-boardwalk/state-api";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { all, wait } from "@shajara/host/primitives";

import type { WorkspaceDatabase } from "./database.js";

function* readLoginReceipt(platform: PlatformName): RiteCoroutine<LoginReceipt | null> {
  try {
    const contents = yield* until(() =>
      readFile(path.join(getAuthenticationDirectory(), `${platform}-login-receipt.json`), "utf8"),
    );
    return JSON.parse(contents) as LoginReceipt;
  } catch {
    return null;
  }
}

function* hasBrowserProfile(platform: PlatformName): RiteCoroutine<boolean> {
  try {
    const metadata = yield* until(() =>
      stat(path.join(getAuthenticationDirectory(), `${platform}-profile`)),
    );
    return metadata.isDirectory();
  } catch {
    return false;
  }
}

export function* readWorkspaceOverview(
  database: WorkspaceDatabase,
): RiteCoroutine<WorkspaceOverview> {
  const platformLoginsFuture = yield* all(
    platformNames.map(
      (platformName) =>
        function* readPlatformLogin() {
          const receipt = yield* readLoginReceipt(platformName);
          if (receipt?.state === "persisted") {
            database.recordPlatformAuthentication(platformName, receipt.authenticatedAt);
          }
          const authenticationState = database.getPlatformAuthenticationState(platformName);
          const commonStatus = {
            hasBrowserProfile: yield* hasBrowserProfile(platformName),
            label: platformCatalog[platformName].label,
            platform: platformName,
          };
          return authenticationState === null
            ? { ...commonStatus, status: "unconfigured" as const }
            : {
                ...commonStatus,
                lastAuthenticatedAt: authenticationState.authenticatedAt,
                status: "observed" as const,
              };
        },
    ),
  );
  const platformLogins: PlatformLoginStatus[] = yield* wait(platformLoginsFuture);

  return {
    platformLogins,
    profileFacts: database.listProfileFacts(),
    targetLocations: database.listTargetLocations(),
  };
}
