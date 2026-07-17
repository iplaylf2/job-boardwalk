import type { Hono } from "hono";
import type { Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import {
  readJsonObject,
  readInitiator,
  readPositiveInteger,
  readRequiredBoolean,
  readRequiredString,
  requestErrorResponse,
} from "./request.js";

const createdStatus = 201;

export function registerProfileFactRoute(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.post("/api/profile/facts", (context) =>
    serviceScope.run(function* setProfileFact() {
      try {
        const input = yield* readJsonObject(context);
        repository.setProfileFact({
          confirmed: readRequiredBoolean(input, "confirmed"),
          initiatedBy: readInitiator(input),
          key: readRequiredString(input, "key"),
          reason: readRequiredString(input, "reason"),
          source: readRequiredString(input, "source"),
          value: readRequiredString(input, "value"),
        });
        return context.json({ ok: true }, createdStatus);
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
  app.delete("/api/profile/facts/:id", (context) =>
    serviceScope.run(function* deleteProfileFact() {
      try {
        const input = yield* readJsonObject(context);
        repository.deleteProfileFact({
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
