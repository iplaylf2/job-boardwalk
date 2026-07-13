import type { PlatformId } from "@job-boardwalk/platform-catalog";

export interface PlatformAccessSummary {
  browserSession: "closed" | "open";
  hasBrowserProfile: boolean;
  label: string;
  authenticationObservedAt?: string;
  platformId: PlatformId;
  authentication: "observed" | "unknown";
}

export interface BrowserHandoff {
  platformId: PlatformId;
  purpose: "browse" | "login";
  status: "handed-off";
  message: string;
}

export interface BrowserAvailability {
  available: boolean;
  executablePath: string;
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
