import type { Hono } from "hono";
import type { Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import { registerJobSearchIntentRoute } from "./job-search-intent-route.js";
import { registerJobEngagementRoute } from "./job-engagement-route.js";
import { registerJobLibraryRoute } from "./job-library-route.js";
import { registerJobObservationRoute } from "./job-observation-route.js";
import { registerPlatformAccessObservationRoute } from "./platform-access-observation-route.js";
import { registerProfileFactRoute } from "./profile-fact-route.js";
import { registerResearchReportRoute } from "./research-report-route.js";
import { registerWorkspaceOverviewRoute } from "./workspace-overview-route.js";

export function registerApiRoutes(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  registerWorkspaceOverviewRoute(app, repository, serviceScope);
  registerPlatformAccessObservationRoute(app, repository, serviceScope);
  registerProfileFactRoute(app, repository, serviceScope);
  registerResearchReportRoute(app, repository, serviceScope);
  registerJobSearchIntentRoute(app, repository, serviceScope);
  registerJobLibraryRoute(app, repository, serviceScope);
  registerJobObservationRoute(app, repository, serviceScope);
  registerJobEngagementRoute(app, repository, serviceScope);
}
