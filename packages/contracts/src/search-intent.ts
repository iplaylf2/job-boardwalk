import type { PlatformId } from "@job-boardwalk/platform-catalog";

export interface JobSearchIntentSource {
  label: string;
  platformId: PlatformId;
  url: string;
}

export interface JobSearchIntent {
  city: string;
  id: number;
  name: string;
  position: string;
  selected: boolean;
  sources: JobSearchIntentSource[];
  updatedAt: string;
}
