import type { PlatformId } from "@job-boardwalk/platform-catalog";

import type {
  PlatformAuthenticationObservation,
  PlatformAccessInterruptionObservation,
} from "./platform-access.ts";

export interface PlatformAccessSummary {
  activeInterruption?: PlatformAccessInterruptionObservation;
  label: string;
  latestAuthentication?: PlatformAuthenticationObservation;
  platformId: PlatformId;
}

export interface ProfileFact {
  confirmed: boolean;
  id: number;
  key: string;
  source: string;
  updatedAt: string;
  value: string;
}

export interface TargetLocation {
  city: string;
  id: number;
  priority: number;
  requirement: "preferred" | "required";
  updatedAt: string;
}

export interface WorkspaceOverview {
  platformAccessSummaries: PlatformAccessSummary[];
  profileFacts: ProfileFact[];
  targetLocations: TargetLocation[];
}
