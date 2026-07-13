import type { PlatformId } from "@job-boardwalk/platform-catalog";

export interface PlatformAccessSummary {
  browserSession: "closed" | "open";
  hasBrowserProfile: boolean;
  label: string;
  authenticationObservedAt?: string;
  platformId: PlatformId;
  authentication: "observed" | "unknown";
}

export type OpenPlatformBrowserPurpose = "browse" | "login";

export interface OpenPlatformBrowserResult {
  message: string;
  platformId: PlatformId;
  purpose: OpenPlatformBrowserPurpose;
  status: "opened";
}

export interface PlatformBrowserAvailability {
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
