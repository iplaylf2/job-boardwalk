import { BrowserSessionPresence } from "./browser-session.ts";
import { contract } from "./internal/contract.ts";
import { platformId, trimmedNonEmptyString } from "./internal/contract-fields.ts";
import { ProfileFact } from "./profile.ts";
import { JobSearchIntent } from "./search-intent.ts";
import {
  RecordedPlatformAuthenticationObservation,
  RecordedPlatformAccessInterruptionObservation,
} from "./platform-access.ts";

export const PlatformAccessSummary = contract({
  label: trimmedNonEmptyString,
  "latestAuthentication?": RecordedPlatformAuthenticationObservation,
  platformId,
  "unresolvedInterruption?": RecordedPlatformAccessInterruptionObservation,
});
export type PlatformAccessSummary = typeof PlatformAccessSummary.infer;

export const WorkspaceOverview = contract({
  browserSessionPresence: BrowserSessionPresence,
  jobSearchIntents: JobSearchIntent.array(),
  platformAccessSummaries: PlatformAccessSummary.array(),
  profileFacts: ProfileFact.array(),
});
export type WorkspaceOverview = typeof WorkspaceOverview.infer;
