import type { Context, Hono } from "hono";
import type { Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import { defaultJobPageSize, firstJobPage, maximumJobPageSize } from "#/job-library/query.js";
import type { JobLibraryQuery } from "#/job-library/query.js";
import { isPlatformId, isPlatformJobEngagementKind } from "@job-boardwalk/platform-catalog";
import { JobDescriptionStatusFilter } from "@job-boardwalk/contracts";
import type { JobEngagementFilter } from "@job-boardwalk/contracts";

import { InvalidRequestError, requestErrorResponse } from "./request.js";

function readJobEngagement(value: string | undefined): JobEngagementFilter | null {
  if (!value) {
    return null;
  }
  if (value !== "tracked" && !isPlatformJobEngagementKind(value)) {
    throw new InvalidRequestError(
      "engagement 必须是 tracked、interested、contacted、applied 或 interviewed",
      { field: "engagement" },
    );
  }
  return value;
}

function readDescriptionStatus(
  value: string | undefined,
): JobLibraryQuery["descriptionStatus"] | null {
  if (!value) {
    return null;
  }
  if (!JobDescriptionStatusFilter.allows(value)) {
    throw new InvalidRequestError(
      "descriptionStatus 必须是 captured、missing 或 identity-unresolved",
      { field: "descriptionStatus" },
    );
  }
  return value;
}

function readExternalJobId(
  externalJobId: string | undefined,
  platform: string | undefined,
): string | undefined {
  if (
    typeof externalJobId === "string" &&
    (!externalJobId.trim() || externalJobId !== externalJobId.trim() || !platform)
  ) {
    throw new InvalidRequestError(
      "externalJobId 必须是无首尾空白的非空 ID，并与 platform 一起使用",
      { field: "externalJobId" },
    );
  }
  return externalJobId;
}

function readJobLibraryQuery(context: Context) {
  const page = readPositiveQueryInteger(context.req.query("page"), firstJobPage, "page");
  const pageSize = readPositiveQueryInteger(
    context.req.query("pageSize"),
    defaultJobPageSize,
    "pageSize",
  );
  if (pageSize > maximumJobPageSize) {
    throw new InvalidRequestError(`pageSize 不能超过 ${String(maximumJobPageSize)}`, {
      field: "pageSize",
    });
  }
  const query = context.req.query("query")?.trim();
  const platform = context.req.query("platform");
  const externalJobId = readExternalJobId(context.req.query("externalJobId"), platform);
  const engagement = readJobEngagement(context.req.query("engagement"));
  const descriptionStatus = readDescriptionStatus(context.req.query("descriptionStatus"));
  const engagementFilter: Pick<JobLibraryQuery, "engagement"> = engagement ? { engagement } : {};
  const descriptionFilter: Pick<JobLibraryQuery, "descriptionStatus"> = descriptionStatus
    ? { descriptionStatus }
    : {};
  if (platform) {
    if (!isPlatformId(platform)) {
      throw new InvalidRequestError("platform 不是受支持的招聘平台", { field: "platform" });
    }
    return {
      page,
      pageSize,
      platformId: platform,
      ...(externalJobId ? { externalJobId } : {}),
      ...descriptionFilter,
      ...engagementFilter,
      ...(query ? { query } : {}),
    };
  }
  return {
    page,
    pageSize,
    ...descriptionFilter,
    ...engagementFilter,
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
    throw new InvalidRequestError(`${name} 必须是正整数`, { field: name });
  }
  return parsed;
}

export function registerJobLibraryRoute(
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
}
