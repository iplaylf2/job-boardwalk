import type { JSX } from "@solidjs/web";

import { JobLibraryPage } from "./job-library/page.js";
import { ResearchReportDetailPage, ResearchReportListPage } from "./research-reports/pages.js";
import { WorkspaceOverviewPage } from "./workspace-overview-page.js";

export function App(): JSX.Element {
  const path = globalThis.location.pathname;
  if (path === "/jobs") {
    return <JobLibraryPage slice="all" />;
  }
  if (path === "/jobs/interested") {
    return <JobLibraryPage slice="interested" />;
  }
  if (path === "/reports") {
    return <ResearchReportListPage />;
  }
  const reportMatch = /^\/reports\/(?<reportId>\d+)$/u.exec(path);
  if (reportMatch?.groups?.["reportId"]) {
    return <ResearchReportDetailPage reportId={Number(reportMatch.groups["reportId"])} />;
  }
  return <WorkspaceOverviewPage />;
}
