import type { Hono } from "hono";
import type { Scope } from "@shajara/host";
import { SynchronizeJobInterestsCommand } from "@job-boardwalk/contracts";
import type { JobInterestSnapshot } from "@job-boardwalk/contracts";
import { parsePlatformWebUrl, platformCatalog } from "@job-boardwalk/platform-catalog";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import { InvalidRequestError, readRequestBody, requestErrorResponse } from "./request.js";

function normalizedPlatformUrl(value: string, platformId: "boss" | "yupao", field: string): string {
  const url = parsePlatformWebUrl(platformId, value);
  if (!url) {
    throw new InvalidRequestError(
      `${field} 必须属于${platformCatalog[platformId].label}的 HTTPS 范围`,
    );
  }
  url.hash = "";
  return url.href;
}

function normalizedJobInterestSnapshot(input: SynchronizeJobInterestsCommand): JobInterestSnapshot {
  return {
    capturedAt: input.capturedAt,
    complete: input.complete,
    jobs: input.jobs.map((job, index) => ({
      ...job,
      ...(job.jobUrl
        ? {
            jobUrl: normalizedPlatformUrl(
              job.jobUrl,
              input.platformId,
              `jobs[${String(index)}].jobUrl`,
            ),
          }
        : {}),
    })),
    platformId: input.platformId,
    sourceUrl: normalizedPlatformUrl(input.sourceUrl, input.platformId, "sourceUrl"),
    total: input.total,
  };
}

export function registerJobInterestRoute(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.put("/api/job-interests", (context) =>
    serviceScope.run(function* synchronizeJobInterests() {
      try {
        const input = yield* readRequestBody(context, SynchronizeJobInterestsCommand);
        return context.json(
          repository.synchronizeJobInterests({
            initiatedBy: input.initiatedBy,
            reason: input.reason,
            snapshot: normalizedJobInterestSnapshot(input),
          }),
        );
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
}
