import type { PlatformId } from "@job-boardwalk/platform-catalog";

export interface RecommendationPageReference {
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
  recommendationPages: RecommendationPageReference[];
  updatedAt: string;
}
