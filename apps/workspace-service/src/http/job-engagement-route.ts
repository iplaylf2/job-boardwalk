import type { Hono } from "hono";
import type { Scope } from "@shajara/host";
import { SynchronizeJobEngagementCommand } from "@job-boardwalk/contracts";
import type { JobEngagementSnapshot } from "@job-boardwalk/contracts";
import {
  parsePlatformJobEngagementUrl,
  parsePlatformWebUrl,
  platformCatalog,
} from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import { InvalidRequestError, readRequestBody, requestErrorResponse } from "./request.js";

function normalizedPlatformUrl(value: string, platformId: PlatformId, field: string): string {
  const url = parsePlatformWebUrl(platformId, value);
  if (!url) {
    throw new InvalidRequestError(
      `${field} 必须属于${platformCatalog[platformId].label}的 HTTPS 范围`,
    );
  }
  url.hash = "";
  return url.href;
}

function normalizedJobEngagementSnapshot(
  input: SynchronizeJobEngagementCommand,
): JobEngagementSnapshot {
  const sourceUrl = normalizedPlatformUrl(input.sourceUrl, input.platformId, "sourceUrl");
  if (parsePlatformJobEngagementUrl(input.platformId, sourceUrl) !== input.engagement) {
    throw new InvalidRequestError(
      "sourceUrl 必须是 platformId 所指定平台中与 engagement 对应的岗位跟进分类页。",
    );
  }
  return {
    capturedAt: input.capturedAt,
    complete: input.complete,
    engagement: input.engagement,
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
    sourceUrl,
    total: input.total,
  };
}

export function registerJobEngagementRoute(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.put("/api/job-engagements", (context) =>
    serviceScope.run(function* synchronizeJobEngagement() {
      try {
        const input = yield* readRequestBody(context, SynchronizeJobEngagementCommand);
        return context.json(
          repository.synchronizeJobEngagement({
            initiatedBy: input.initiatedBy,
            reason: input.reason,
            snapshot: normalizedJobEngagementSnapshot(input),
          }),
        );
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
}
