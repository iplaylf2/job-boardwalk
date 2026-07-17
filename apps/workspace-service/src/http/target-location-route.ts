import type { Hono } from "hono";
import type { Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import {
  InvalidRequestError,
  readJsonObject,
  readInitiator,
  readPositiveInteger,
  readRequiredString,
  requestErrorResponse,
} from "./request.js";

const createdStatus = 201;

export function registerTargetLocationRoute(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.post("/api/search-intent/locations", (context) =>
    serviceScope.run(function* setTargetLocation() {
      try {
        const input = yield* readJsonObject(context);
        const { priority, requirement } = input;
        if (
          !Number.isInteger(priority) ||
          (requirement !== "required" && requirement !== "preferred")
        ) {
          throw new InvalidRequestError(
            "priority 必须是整数，requirement 必须是 required 或 preferred",
          );
        }
        repository.setTargetLocation({
          city: readRequiredString(input, "city"),
          initiatedBy: readInitiator(input),
          priority: priority as number,
          reason: readRequiredString(input, "reason"),
          requirement,
        });
        return context.json({ ok: true }, createdStatus);
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
  app.delete("/api/search-intent/locations/:id", (context) =>
    serviceScope.run(function* deleteTargetLocation() {
      try {
        const input = yield* readJsonObject(context);
        repository.deleteTargetLocation({
          id: readPositiveInteger(context.req.param("id"), "id"),
          initiatedBy: readInitiator(input),
          reason: readRequiredString(input, "reason"),
        });
        return context.json({ ok: true });
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
}
