import type { PlatformId } from "@job-boardwalk/platform-catalog";

export type RecommendationPageKind = "job-search-intent-recommendations";

export interface RecommendedJobEvidence {
  company?: string;
  details: string[];
  educationRequirement?: string;
  experienceRequirement?: string;
  href: string;
  location?: string;
  salary?: string;
  text: string;
  title: string;
}

export interface RecommendationPageSnapshot {
  capturedAt: string;
  items: RecommendedJobEvidence[];
  pageKind: RecommendationPageKind;
  platformId: PlatformId;
  sourceTitle: string;
  sourceUrl: string;
  truncated: boolean;
}
