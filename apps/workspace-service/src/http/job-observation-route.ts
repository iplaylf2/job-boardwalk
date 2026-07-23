import type { Hono } from "hono";
import {
  SaveJobCardObservationCommand,
  SaveJobDescriptionObservationCommand,
} from "@job-boardwalk/contracts";
import type { Scope } from "@shajara/host";

import {
  normalizeJobCardObservation,
  normalizeJobDescriptionObservation,
} from "#/job-observation/normalization.js";
import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import { readRequestBody, requestErrorResponse } from "./request.js";

const createdStatus = 201;

export function registerJobObservationRoute(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.post("/api/job-card-observations", (context) =>
    serviceScope.run(function* saveJobCardObservation() {
      try {
        const input = yield* readRequestBody(context, SaveJobCardObservationCommand);
        return context.json(
          repository.saveJobCardObservation({
            initiatedBy: input.initiatedBy,
            observation: normalizeJobCardObservation(input),
            reason: input.reason,
          }),
          createdStatus,
        );
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
  app.post("/api/job-description-observations", (context) =>
    serviceScope.run(function* saveJobDescriptionObservation() {
      try {
        const input = yield* readRequestBody(context, SaveJobDescriptionObservationCommand);
        return context.json(
          repository.saveJobDescriptionObservation({
            initiatedBy: input.initiatedBy,
            observation: normalizeJobDescriptionObservation(input),
            reason: input.reason,
          }),
          createdStatus,
        );
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
}
