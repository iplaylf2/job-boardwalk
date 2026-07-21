import type { Hono } from "hono";
import { PlatformAccessObservation } from "@job-boardwalk/contracts";
import type { Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import { readRequestBody, requestErrorResponse } from "./request.js";

const createdStatus = 201;

export function registerPlatformAccessObservationRoute(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.post("/api/platform-access/observations", (context) =>
    serviceScope.run(function* recordPlatformAccessObservation() {
      try {
        const input = yield* readRequestBody(context, PlatformAccessObservation);
        const observation = repository.recordPlatformAccessObservation(input);
        return context.json(observation, createdStatus);
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
}
