import type {
  JobPostingObservation,
  SaveJobPostingObservationCommand,
} from "@job-boardwalk/contracts";
import { parsePlatformWebUrl, platformCatalog } from "@job-boardwalk/platform-catalog";

import { InvalidRequestError } from "#/http/request.js";

function normalizePlatformUrl(
  value: string,
  platformId: JobPostingObservation["platformId"],
): string {
  const url = parsePlatformWebUrl(platformId, value);
  if (!url) {
    throw new InvalidRequestError(
      `岗位来源 URL 必须属于${platformCatalog[platformId].label}的 HTTPS 范围`,
    );
  }
  url.hash = "";
  return url.href;
}

export function normalizeJobPostingObservation(
  input: SaveJobPostingObservationCommand,
): JobPostingObservation {
  const { initiatedBy: _initiatedBy, reason: _reason, ...observation } = input;
  return {
    ...observation,
    details: [...new Set(observation.details)],
    discoveryUrl: normalizePlatformUrl(observation.discoveryUrl, observation.platformId),
    ...(observation.jobUrl
      ? { jobUrl: normalizePlatformUrl(observation.jobUrl, observation.platformId) }
      : {}),
  };
}
