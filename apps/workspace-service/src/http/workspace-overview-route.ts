import type { Hono } from "hono";
import type { Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import { readWorkspaceOverview } from "#/read-model/workspace-overview.js";
import type { BrowserSessionPresenceTracker } from "#/runtime/browser-session-presence.js";

import { requestErrorResponse } from "./request.js";

export function registerWorkspaceOverviewRoute(
  app: Hono,
  repository: WorkspaceRepository,
  presenceTracker: BrowserSessionPresenceTracker,
  serviceScope: Scope,
): void {
  app.get("/api/workspace/overview", (context) =>
    serviceScope.run(function* getWorkspaceOverview() {
      try {
        yield* [];
        return context.json(readWorkspaceOverview(repository, presenceTracker));
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
}
