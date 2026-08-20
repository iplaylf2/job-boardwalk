import type { JobEngagementFilter, JobEngagementKind } from "@job-boardwalk/contracts";

export type JobLibraryView = "all" | JobEngagementFilter;

export const jobEngagementLabels: Record<JobEngagementKind, string> = {
  applied: "已投递",
  contacted: "沟通过",
  interested: "感兴趣",
  interviewed: "面试",
};

export const jobLibraryViews = [
  "all",
  "tracked",
  "interested",
  "contacted",
  "applied",
  "interviewed",
] as const;

export function jobLibraryViewLabel(view: JobLibraryView): string {
  if (view === "all") {
    return "全部岗位";
  }
  return view === "tracked" ? "全部跟进" : jobEngagementLabels[view];
}

export function readJobLibraryView(value: string | null): JobLibraryView {
  return jobLibraryViews.find((view) => view === value) ?? "all";
}
