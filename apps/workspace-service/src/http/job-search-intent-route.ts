import type { Hono } from "hono";
import type { Scope } from "@shajara/host";
import type { RecommendationPageReference } from "@job-boardwalk/contracts";
import {
  isPlatformId,
  parsePlatformWebUrl,
  platformCatalog,
} from "@job-boardwalk/platform-catalog";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import {
  InvalidRequestError,
  isRecord,
  readInitiator,
  readJsonObject,
  readPositiveInteger,
  readRequiredArray,
  readRequiredBoolean,
  readRequiredString,
  requestErrorResponse,
} from "./request.js";

const createdStatus = 201;
const emptyCollectionLength = 0;

function readRecommendationPages(input: Record<string, unknown>): RecommendationPageReference[] {
  const recommendationPages = readRequiredArray(input, "recommendationPages");
  if (recommendationPages.length === emptyCollectionLength) {
    throw new InvalidRequestError("recommendationPages 至少需要一个平台关联");
  }
  const parsed = recommendationPages.map((page, index) => {
    if (!isRecord(page)) {
      throw new InvalidRequestError(`recommendationPages[${String(index)}] 必须是对象`);
    }
    const platformId = readRequiredString(page, "platformId");
    if (!isPlatformId(platformId)) {
      throw new InvalidRequestError(`recommendationPages[${String(index)}].platformId 不受支持`);
    }
    const url = parsePlatformWebUrl(platformId, readRequiredString(page, "url"));
    if (!url) {
      throw new InvalidRequestError(
        `recommendationPages[${String(index)}].url 必须属于${platformCatalog[platformId].label}`,
      );
    }
    url.hash = "";
    return {
      label: readRequiredString(page, "label"),
      platformId,
      url: url.href,
    };
  });
  if (new Set(parsed.map(({ platformId }) => platformId)).size !== parsed.length) {
    throw new InvalidRequestError("每个招聘平台只能关联一次");
  }
  return parsed;
}

function saveIntent(repository: WorkspaceRepository, input: Record<string, unknown>, id?: number) {
  return repository.saveJobSearchIntent({
    city: readRequiredString(input, "city"),
    ...(id ? { id } : {}),
    initiatedBy: readInitiator(input),
    name: readRequiredString(input, "name"),
    position: readRequiredString(input, "position"),
    reason: readRequiredString(input, "reason"),
    recommendationPages: readRecommendationPages(input),
    selected: readRequiredBoolean(input, "selected"),
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
        const input = yield* readJsonObject(context);
        return context.json(saveIntent(repository, input), createdStatus);
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
  app.put("/api/search-intents/:id", (context) =>
    serviceScope.run(function* updateJobSearchIntent() {
      try {
        const input = yield* readJsonObject(context);
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
        const input = yield* readJsonObject(context);
        repository.selectJobSearchIntent({
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
  app.delete("/api/search-intents/:id", (context) =>
    serviceScope.run(function* deleteJobSearchIntent() {
      try {
        const input = yield* readJsonObject(context);
        repository.deleteJobSearchIntent({
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
