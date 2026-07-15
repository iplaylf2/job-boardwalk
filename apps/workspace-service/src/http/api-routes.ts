import type { Hono } from "hono";
import type { Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import type { BrowserSessionPresenceTracker } from "#/runtime/browser-session-presence.js";

import { registerBrowserSessionStatusRoute } from "./browser-session-status-route.js";
import { registerPlatformAccessObservationRoute } from "./platform-access-observation-route.js";
import { registerProfileFactRoute } from "./profile-fact-route.js";
import { registerTargetLocationRoute } from "./target-location-route.js";
import { registerWorkspaceOverviewRoute } from "./workspace-overview-route.js";

export function registerApiRoutes(
  app: Hono,
  repository: WorkspaceRepository,
  presenceTracker: BrowserSessionPresenceTracker,
  serviceScope: Scope,
): void {
  registerWorkspaceOverviewRoute(app, repository, presenceTracker, serviceScope);
  registerBrowserSessionStatusRoute(app, presenceTracker, repository, serviceScope);
  registerPlatformAccessObservationRoute(app, repository, serviceScope);
  registerProfileFactRoute(app, repository, serviceScope);
  registerTargetLocationRoute(app, repository, serviceScope);
}
