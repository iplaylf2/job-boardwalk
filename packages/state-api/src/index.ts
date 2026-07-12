import type { PlatformName } from "@job-boardwalk/platforms";

export interface PlatformLoginStatus {
  hasBrowserProfile: boolean;
  label: string;
  lastAuthenticatedAt?: string;
  platform: PlatformName;
  status: "observed" | "unconfigured";
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
  platformLogins: PlatformLoginStatus[];
  profileFacts: ProfileFact[];
  targetLocations: TargetLocation[];
}
