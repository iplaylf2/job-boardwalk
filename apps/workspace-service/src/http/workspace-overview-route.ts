import type { Hono } from "hono";
import type { Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import { readWorkspaceOverview } from "#/read-model/workspace-overview.js";

import { requestErrorResponse } from "./request.js";

export function registerWorkspaceOverviewRoute(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.get("/api/workspace/overview", (context) =>
    serviceScope.run(function* getWorkspaceOverview() {
      try {
        yield* [];
        return context.json(readWorkspaceOverview(repository));
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
}
