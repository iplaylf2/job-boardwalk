import type { PlatformId } from "@job-boardwalk/platform-catalog";

export interface JobCardEvidence {
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

export interface JobCardSnapshot {
  capturedAt: string;
  cards: JobCardEvidence[];
  platformId: PlatformId;
  sourceTitle: string;
  sourceUrl: string;
  truncated: boolean;
}
