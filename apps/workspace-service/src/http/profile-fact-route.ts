import type { Hono } from "hono";
import {
  CreateProfileFactCommand,
  UpdateProfileFactCommand,
  WorkspaceChangeAttribution,
} from "@job-boardwalk/contracts";
import type { Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import { readPositiveInteger, readRequestBody, requestErrorResponse } from "./request.js";

const createdStatus = 201;

export function registerProfileFactRoute(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.post("/api/profile/facts", (context) =>
    serviceScope.run(function* setProfileFact() {
      try {
        const input = yield* readRequestBody(context, CreateProfileFactCommand);
        return context.json(repository.createProfileFact(input), createdStatus);
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
  app.put("/api/profile/facts/:id", (context) =>
    serviceScope.run(function* updateProfileFact() {
      try {
        const input = yield* readRequestBody(context, UpdateProfileFactCommand);
        const updated = repository.updateProfileFact({
          id: readPositiveInteger(context.req.param("id"), "id"),
          ...input,
        });
        if (!updated) {
          throw new Error(`找不到个人资料：${context.req.param("id")}`);
        }
        return context.json(updated);
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
  app.delete("/api/profile/facts/:id", (context) =>
    serviceScope.run(function* deleteProfileFact() {
      try {
        const input = yield* readRequestBody(context, WorkspaceChangeAttribution);
        repository.deleteProfileFact({
          id: readPositiveInteger(context.req.param("id"), "id"),
          ...input,
        });
        return context.json({ ok: true });
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
}
