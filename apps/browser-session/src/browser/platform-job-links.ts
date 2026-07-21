import { parsePlatformWebUrl } from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";

export const platformJobLinkPathPatterns = {
  boss: String.raw`^/job_detail/(?<externalJobId>[^/]+)\.html$`,
  yupao: String.raw`^/zhaogong/(?<externalJobId>\d+)(?:/[^/]+)?\.html$`,
} as const satisfies Record<PlatformId, string>;

export function extractExternalJobId(platformId: PlatformId, jobUrl: string): string | null {
  const url = parsePlatformWebUrl(platformId, jobUrl);
  if (!url) {
    return null;
  }
  const match = new RegExp(platformJobLinkPathPatterns[platformId], "u").exec(url.pathname);
  return match?.groups?.["externalJobId"] ?? null;
}
