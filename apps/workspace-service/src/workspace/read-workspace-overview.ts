import type { PlatformAccessSummary, WorkspaceOverview } from "@job-boardwalk/contracts";
import { platformCatalog, platformIds } from "@job-boardwalk/platform-catalog";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

export function readWorkspaceOverview(repository: WorkspaceRepository): WorkspaceOverview {
  const latestObservations = new Map(
    repository
      .listLatestPlatformAccessObservations()
      .map((observation) => [observation.platformId, observation] as const),
  );
  return {
    platformAccess: platformIds.map((platformId) => {
      const latestObservation = latestObservations.get(platformId);
      const summary: PlatformAccessSummary = {
        label: platformCatalog[platformId].label,
        platformId,
      };
      if (latestObservation) {
        summary.latestObservation = latestObservation;
      }
      return summary;
    }),
    profileFacts: repository.listProfileFacts(),
    targetLocations: repository.listTargetLocations(),
  };
}
