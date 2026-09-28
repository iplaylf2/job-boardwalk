import type {
  PlatformAccessSummary,
  RecordedPlatformAuthenticationObservation,
  RecordedPlatformAccessInterruptionObservation,
  WorkspaceOverview,
} from "@job-boardwalk/contracts";
import { platformCatalog, platformIds } from "@job-boardwalk/platform-catalog";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

export function readWorkspaceOverview(repository: WorkspaceRepository): WorkspaceOverview {
  const observations = repository.listPlatformAccessObservations();
  return {
    jobSearchIntents: repository.listJobSearchIntents(),
    platformAccessSummaries: platformIds.map((platformId) => {
      const platformObservations = observations.filter(
        (observation) => observation.platformId === platformId,
      );
      const latestAuthentication = platformObservations.find(
        (observation): observation is RecordedPlatformAuthenticationObservation =>
          "authenticationState" in observation,
      );
      const latestInterruption = platformObservations.find(
        (observation): observation is RecordedPlatformAccessInterruptionObservation =>
          "interruption" in observation,
      );
      const summary: PlatformAccessSummary = {
        label: platformCatalog[platformId].label,
        platformId,
      };
      if (latestAuthentication) {
        summary.latestAuthentication = latestAuthentication;
      }
      if (latestInterruption) {
        summary.latestInterruption = latestInterruption;
      }
      return summary;
    }),
    profileFacts: repository.listProfileFacts(),
  };
}
