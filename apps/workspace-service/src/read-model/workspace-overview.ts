import type {
  PlatformAccessSummary,
  RecordedPlatformAccessObservation,
  RecordedPlatformAuthenticationObservation,
  RecordedPlatformAccessInterruptionObservation,
  WorkspaceOverview,
} from "@job-boardwalk/contracts";
import { platformCatalog, platformIds } from "@job-boardwalk/platform-catalog";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import type { BrowserSessionPresenceTracker } from "#/runtime/browser-session-presence.js";

const equalRecency = 0;

export function readWorkspaceOverview(
  repository: WorkspaceRepository,
  presenceTracker: BrowserSessionPresenceTracker,
): WorkspaceOverview {
  const observations = repository.listPlatformAccessObservations();
  return {
    browserSessionPresence: presenceTracker.presence,
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
      if (
        latestInterruption &&
        (!latestAuthentication ||
          compareObservationRecency(latestInterruption, latestAuthentication) > equalRecency)
      ) {
        summary.unresolvedInterruption = latestInterruption;
      }
      return summary;
    }),
    profileFacts: repository.listProfileFacts(),
  };
}

function compareObservationRecency(
  left: RecordedPlatformAccessObservation,
  right: RecordedPlatformAccessObservation,
): number {
  const timestampComparison = left.observedAt.localeCompare(right.observedAt);
  return timestampComparison === equalRecency ? left.id - right.id : timestampComparison;
}
