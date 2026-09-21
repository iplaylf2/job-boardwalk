import {
  OperationError,
  CreateProfileFactCommand,
  UpdateProfileFactCommand,
  WorkspaceChangeAttribution,
} from "@job-boardwalk/contracts";
import type { Hono } from "hono";
import type { Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import { readPositiveInteger, readRequestBody, requestErrorResponse } from "./request.js";

const createdStatus = 201;

// eslint-disable-next-line max-lines-per-function -- This function declares the cohesive profile-fact HTTP resource surface.
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
        const id = readPositiveInteger(context.req.param("id"), "id");
        const updated = repository.updateProfileFact({
          id,
          ...input,
        });
        return updated
          ? context.json(updated)
          : requestErrorResponse(
              new OperationError("not-found", "找不到个人条件", {
                id,
                resource: "profile-fact",
              }),
              context,
            );
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
