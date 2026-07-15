import type { PlatformId } from "@job-boardwalk/platform-catalog";

import type { BrowserSessionPresence } from "./browser-session.ts";
import type { ProfileFact } from "./profile.ts";
import type { TargetLocation } from "./search-intent.ts";
import type {
  PlatformAuthenticationObservation,
  PlatformAccessInterruptionObservation,
} from "./platform-access.ts";

export interface PlatformAccessSummary {
  label: string;
  latestAuthentication?: PlatformAuthenticationObservation;
  platformId: PlatformId;
  unresolvedInterruption?: PlatformAccessInterruptionObservation;
}

export interface WorkspaceOverview {
  browserSessionPresence: BrowserSessionPresence;
  platformAccessSummaries: PlatformAccessSummary[];
  profileFacts: ProfileFact[];
  targetLocations: TargetLocation[];
}
