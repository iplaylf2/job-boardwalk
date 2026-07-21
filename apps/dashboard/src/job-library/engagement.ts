import type { JobEngagementKind } from "@job-boardwalk/contracts";

export type JobLibraryView = "all" | JobEngagementKind;

export const jobEngagementLabels: Record<JobEngagementKind, string> = {
  applied: "已投递",
  contacted: "沟通过",
  interested: "感兴趣",
  interviewed: "面试",
};

export const jobLibraryViews = [
  "all",
  "interested",
  "contacted",
  "applied",
  "interviewed",
] as const;

export function jobLibraryViewLabel(view: JobLibraryView): string {
  return view === "all" ? "全部" : jobEngagementLabels[view];
}

export function readJobLibraryView(value: string | null): JobLibraryView {
  return jobLibraryViews.find((view) => view === value) ?? "all";
}
