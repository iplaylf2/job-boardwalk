import type { Context, Hono } from "hono";
import type { Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import { parseJobPostingObservation } from "#/job-posting/observation-input.js";
import {
  defaultJobPageSize,
  firstJobPage,
  maximumJobPageSize,
} from "#/job-posting/library-query.js";
import { isPlatformId } from "@job-boardwalk/platform-catalog";

import {
  InvalidRequestError,
  readInitiator,
  readJsonObject,
  readRequiredString,
  requestErrorResponse,
} from "./request.js";

const createdStatus = 201;
function readJobLibraryQuery(context: Context) {
  const page = readPositiveQueryInteger(context.req.query("page"), firstJobPage, "page");
  const pageSize = readPositiveQueryInteger(
    context.req.query("pageSize"),
    defaultJobPageSize,
    "pageSize",
  );
  if (pageSize > maximumJobPageSize) {
    throw new InvalidRequestError(`pageSize 不能超过 ${String(maximumJobPageSize)}`);
  }
  const query = context.req.query("query")?.trim();
  const platform = context.req.query("platform");
  if (platform) {
    if (!isPlatformId(platform)) {
      throw new InvalidRequestError("platform 不是受支持的招聘平台");
    }
    return {
      page,
      pageSize,
      platformId: platform,
      ...(query ? { query } : {}),
    };
  }
  return {
    page,
    pageSize,
    ...(query ? { query } : {}),
  };
}

function readPositiveQueryInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < firstJobPage) {
    throw new InvalidRequestError(`${name} 必须是正整数`);
  }
  return parsed;
}

export function registerJobPostingRoute(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.get("/api/jobs", (context) =>
    serviceScope.run(function* readJobPostings() {
      try {
        yield* [];
        return context.json(repository.listJobPostingPage(readJobLibraryQuery(context)));
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
  app.post("/api/jobs", (context) =>
    serviceScope.run(function* saveJobPostingObservation() {
      try {
        const input = yield* readJsonObject(context);
        return context.json(
          repository.saveJobPostingObservation({
            initiatedBy: readInitiator(input),
            observation: parseJobPostingObservation(input),
            reason: readRequiredString(input, "reason"),
          }),
          createdStatus,
        );
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
}
