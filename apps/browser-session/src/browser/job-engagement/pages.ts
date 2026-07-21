import {
  parsePlatformJobEngagementUrl,
  parsePlatformWebUrl,
  resolvePlatformJobEngagementUrl,
} from "@job-boardwalk/platform-catalog";
import type { PlatformId, PlatformJobEngagementKind } from "@job-boardwalk/platform-catalog";

const firstPage = 1;

export function jobEngagementPageUrl(
  platformId: PlatformId,
  engagement: PlatformJobEngagementKind,
  page = firstPage,
): string {
  const url = new URL(resolvePlatformJobEngagementUrl(platformId, engagement));
  if (platformId === "boss") {
    url.searchParams.set("page", String(page));
  }
  return url.href;
}

export function isJobEngagementPage(platformId: PlatformId, value: string): boolean {
  return parsePlatformJobEngagementUrl(platformId, value) !== null;
}

export function isExactJobEngagementPage(
  platformId: PlatformId,
  engagement: PlatformJobEngagementKind,
  page: number,
  value: string,
): boolean {
  const url = parsePlatformWebUrl(platformId, value);
  if (!url || parsePlatformJobEngagementUrl(platformId, value) !== engagement) {
    return false;
  }
  return platformId !== "boss" || Number(url.searchParams.get("page")) === page;
}
