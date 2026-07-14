import type {
  PlatformAccessObservation,
  PlatformAccessSummary,
  PlatformAuthenticationObservation,
  PlatformAccessInterruptionObservation,
  WorkspaceOverview,
} from "@job-boardwalk/contracts";
import { platformCatalog, platformIds } from "@job-boardwalk/platform-catalog";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

const equalRecency = 0;

export function readWorkspaceOverview(repository: WorkspaceRepository): WorkspaceOverview {
  const observations = repository.listPlatformAccessObservations();
  return {
    platformAccessSummaries: platformIds.map((platformId) => {
      const platformObservations = observations.filter(
        (observation) => observation.platformId === platformId,
      );
      const latestAuthentication = platformObservations.find(
        (observation): observation is PlatformAuthenticationObservation =>
          "authenticationState" in observation,
      );
      const latestInterruption = platformObservations.find(
        (observation): observation is PlatformAccessInterruptionObservation =>
          "interruption" in observation,
      );
      const summary: PlatformAccessSummary = {
        label: platformCatalog[platformId].label,
        platformId,
      };
      if (latestAuthentication) {
        summary.latestAuthentication = latestAuthentication;
      }
      if (
        latestInterruption &&
        (!latestAuthentication ||
          compareObservationRecency(latestInterruption, latestAuthentication) > equalRecency)
      ) {
        summary.activeInterruption = latestInterruption;
      }
      return summary;
    }),
    profileFacts: repository.listProfileFacts(),
    targetLocations: repository.listTargetLocations(),
  };
}

function compareObservationRecency(
  left: PlatformAccessObservation,
  right: PlatformAccessObservation,
): number {
  const timestampComparison = left.observedAt.localeCompare(right.observedAt);
  return timestampComparison === equalRecency ? left.id - right.id : timestampComparison;
}
