import type { PlatformId } from "@job-boardwalk/platform-catalog";

import type { PlatformAccessObservation } from "./platform-access.ts";

export interface PlatformAccessSummary {
  label: string;
  latestObservation?: PlatformAccessObservation;
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
  platformAccess: PlatformAccessSummary[];
  profileFacts: ProfileFact[];
  targetLocations: TargetLocation[];
}
