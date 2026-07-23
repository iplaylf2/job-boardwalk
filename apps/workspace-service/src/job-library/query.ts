import type { JobEngagementKind } from "@job-boardwalk/contracts";
import type { PlatformId } from "@job-boardwalk/platform-catalog";

export const firstJobPage = 1;
export const defaultJobPageSize = 24;
export const maximumJobPageSize = 48;

export interface JobLibraryQuery {
  engagement?: JobEngagementKind;
  page: number;
  pageSize: number;
  platformId?: PlatformId;
  query?: string;
}
