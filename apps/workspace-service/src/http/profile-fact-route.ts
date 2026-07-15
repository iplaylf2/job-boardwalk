import type { Hono } from "hono";
import type { Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import {
  readJsonObject,
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
}
