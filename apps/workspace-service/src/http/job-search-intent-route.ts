import type { Hono } from "hono";
import type { Scope } from "@shajara/host";
import { SaveJobSearchIntentCommand, WorkspaceChangeAttribution } from "@job-boardwalk/contracts";
import type { RecommendationPageReference } from "@job-boardwalk/contracts";
import { parsePlatformWebUrl, platformCatalog } from "@job-boardwalk/platform-catalog";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import {
  InvalidRequestError,
  readPositiveInteger,
  readRequestBody,
  requestErrorResponse,
} from "./request.js";

const createdStatus = 201;

function normalizeRecommendationPages(
  recommendationPages: RecommendationPageReference[],
): RecommendationPageReference[] {
  const normalized = recommendationPages.map((page, index) => {
    const url = parsePlatformWebUrl(page.platformId, page.url);
    if (!url) {
      throw new InvalidRequestError(
        `recommendationPages[${String(index)}].url 必须属于${platformCatalog[page.platformId].label}`,
      );
    }
    url.hash = "";
    return {
      label: page.label,
      platformId: page.platformId,
      url: url.href,
    };
  });
  if (new Set(normalized.map(({ platformId }) => platformId)).size !== normalized.length) {
    throw new InvalidRequestError("每个招聘平台只能关联一次");
  }
  return normalized;
}

function saveIntent(
  repository: WorkspaceRepository,
  input: SaveJobSearchIntentCommand,
  id?: number,
) {
  return repository.saveJobSearchIntent({
    ...input,
    ...(id ? { id } : {}),
    recommendationPages: normalizeRecommendationPages(input.recommendationPages),
  });
}

// eslint-disable-next-line max-lines-per-function -- This function declares one cohesive HTTP resource surface.
export function registerJobSearchIntentRoute(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.post("/api/search-intents", (context) =>
    serviceScope.run(function* createJobSearchIntent() {
      try {
        const input = yield* readRequestBody(context, SaveJobSearchIntentCommand);
        return context.json(saveIntent(repository, input), createdStatus);
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
  app.put("/api/search-intents/:id", (context) =>
    serviceScope.run(function* updateJobSearchIntent() {
      try {
        const input = yield* readRequestBody(context, SaveJobSearchIntentCommand);
        const id = readPositiveInteger(context.req.param("id"), "id");
        return context.json(saveIntent(repository, input, id));
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
  app.post("/api/search-intents/:id/select", (context) =>
    serviceScope.run(function* selectJobSearchIntent() {
      try {
        const input = yield* readRequestBody(context, WorkspaceChangeAttribution);
        repository.selectJobSearchIntent({
          id: readPositiveInteger(context.req.param("id"), "id"),
          ...input,
        });
        return context.json({ ok: true });
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
  app.delete("/api/search-intents/:id", (context) =>
    serviceScope.run(function* deleteJobSearchIntent() {
      try {
        const input = yield* readRequestBody(context, WorkspaceChangeAttribution);
        repository.deleteJobSearchIntent({
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
