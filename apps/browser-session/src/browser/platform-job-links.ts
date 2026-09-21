import { parsePlatformWebUrl } from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";

import type { JobLinkConfig } from "./platforms/types.js";
import { platformPageDefinitions } from "./platforms/page-definitions.js";

export function extractExternalJobId(platformId: PlatformId, jobUrl: string): string | null {
  const url = parsePlatformWebUrl(platformId, jobUrl);
  const config: JobLinkConfig = platformPageDefinitions[platformId].jobLink;
  const origins = config.jobLinkOrigins;
  if (!url || (origins && !origins.includes(url.origin))) {
    return null;
  }
  const match = new RegExp(config.jobLinkPathPattern, "u").exec(url.pathname);
  return match?.groups?.["externalJobId"] ?? null;
}
