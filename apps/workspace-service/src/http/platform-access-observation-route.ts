import type { Hono } from "hono";
import type { Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import { readPlatformAccessObservation } from "./platform-access-observation-parser.js";
import { readJsonObject, requestErrorResponse } from "./request.js";

const createdStatus = 201;

export function registerPlatformAccessObservationRoute(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.post("/api/platform-access/observations", (context) =>
    serviceScope.run(function* recordPlatformAccessObservation() {
      try {
        const input = yield* readJsonObject(context);
        const observation = repository.recordPlatformAccessObservation(
          readPlatformAccessObservation(input),
        );
        return context.json(observation, createdStatus);
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
}
