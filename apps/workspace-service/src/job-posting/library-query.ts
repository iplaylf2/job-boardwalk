import type { PlatformId } from "@job-boardwalk/platform-catalog";

export const firstJobPage = 1;
export const defaultJobPageSize = 24;
export const maximumJobPageSize = 48;

export interface JobLibraryQuery {
  interestedOnly?: boolean;
  page: number;
  pageSize: number;
  platformId?: PlatformId;
  query?: string;
}
