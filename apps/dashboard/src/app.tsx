import type { JSX } from "@solidjs/web";

import { JobLibraryPage } from "./job-library/page.js";
import { WorkspaceOverviewPage } from "./workspace-overview-page.js";

export function App(): JSX.Element {
  return globalThis.location.pathname === "/jobs" ? <JobLibraryPage /> : <WorkspaceOverviewPage />;
}
