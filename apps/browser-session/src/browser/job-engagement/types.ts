import type { Page } from "patchright";
import type { RiteCoroutine } from "@shajara/host";
import type { JobEngagementEvidence } from "@job-boardwalk/contracts";
import type { PlatformId, PlatformJobEngagementKind } from "@job-boardwalk/platform-catalog";

export interface JobEngagementPageMetadata {
  jobs: JobEngagementEvidence[];
  text: string;
  truncated: boolean;
  url: string;
}

export interface JobEngagementTarget {
  engagement: PlatformJobEngagementKind;
  url: string;
}

export interface JobEngagementPlatformAdapter {
  capturePage: (page: Page) => RiteCoroutine<JobEngagementPageMetadata>;
  initialTarget: (engagement: PlatformJobEngagementKind) => JobEngagementTarget;
  matchesTarget: (target: JobEngagementTarget, value: string) => boolean;
  nextTarget: (target: JobEngagementTarget) => JobEngagementTarget | null;
  platformId: PlatformId;
  readTotal: (text: string, engagement: PlatformJobEngagementKind) => number | null;
}

export interface JobEngagementPageCaptureLimits {
  maximumCards: number;
  maximumSummaryCharacters: number;
}
