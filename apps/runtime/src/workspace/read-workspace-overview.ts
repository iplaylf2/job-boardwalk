import path from "node:path";
import { stat } from "node:fs/promises";

import { getAuthenticationDirectory } from "@job-boardwalk/storage-layout";
import { platformCatalog, platformIds } from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import type { PlatformAccessSummary, WorkspaceOverview } from "@job-boardwalk/contracts";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { all, wait } from "@shajara/host/primitives";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

function* hasBrowserProfile(platformId: PlatformId): RiteCoroutine<boolean> {
  try {
    const metadata = yield* until(() =>
      stat(path.join(getAuthenticationDirectory(), `${platformId}-profile`)),
    );
    return metadata.isDirectory();
  } catch {
    return false;
  }
}

export function* readWorkspaceOverview(
  repository: WorkspaceRepository,
  hasOpenBrowserSession: (platformId: PlatformId) => boolean = () => false,
): RiteCoroutine<WorkspaceOverview> {
  const platformAccessFuture = yield* all(
    platformIds.map(
      (platformId) =>
        function* readPlatformAccess() {
          const authenticationObservation = repository.getAuthenticationObservation(platformId);
          const commonSummary = {
            browserSession: hasOpenBrowserSession(platformId)
              ? ("open" as const)
              : ("closed" as const),
            hasBrowserProfile: yield* hasBrowserProfile(platformId),
            label: platformCatalog[platformId].label,
            platformId,
          };
          return authenticationObservation === null
            ? { ...commonSummary, authentication: "unknown" as const }
            : {
                ...commonSummary,
                authentication: "observed" as const,
                authenticationObservedAt: authenticationObservation.observedAt,
              };
        },
    ),
  );
  const platformAccess: PlatformAccessSummary[] = yield* wait(platformAccessFuture);

  return {
    platformAccess,
    profileFacts: repository.listProfileFacts(),
    targetLocations: repository.listTargetLocations(),
  };
}
