import type { PlatformId } from "@job-boardwalk/platform-catalog";

import type { BrowserSessionPresence } from "./browser-session.ts";
import type { ProfileFact } from "./profile.ts";
import type { JobSearchIntent } from "./search-intent.ts";
import type {
  RecordedPlatformAuthenticationObservation,
  RecordedPlatformAccessInterruptionObservation,
} from "./platform-access.ts";

export interface PlatformAccessSummary {
  label: string;
  latestAuthentication?: RecordedPlatformAuthenticationObservation;
  platformId: PlatformId;
  unresolvedInterruption?: RecordedPlatformAccessInterruptionObservation;
}

export interface WorkspaceOverview {
  browserSessionPresence: BrowserSessionPresence;
  jobSearchIntents: JobSearchIntent[];
  platformAccessSummaries: PlatformAccessSummary[];
  profileFacts: ProfileFact[];
}
