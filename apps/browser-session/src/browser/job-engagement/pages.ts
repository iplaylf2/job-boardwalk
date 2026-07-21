import {
  parsePlatformWebUrl,
  platformJobEngagementKinds,
  resolvePlatformJobEngagementUrl,
} from "@job-boardwalk/platform-catalog";
import type { PlatformId, PlatformJobEngagementKind } from "@job-boardwalk/platform-catalog";

const firstEngagementTabNumber = 1;
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

export function jobEngagementFromPage(
  platformId: PlatformId,
  value: string,
): PlatformJobEngagementKind | null {
  const url = parsePlatformWebUrl(platformId, value);
  if (!url) {
    return null;
  }
  const tab = url.searchParams.get("tab");
  const engagement = platformJobEngagementKinds[Number(tab) - firstEngagementTabNumber];
  if (!engagement) {
    return null;
  }
  if (platformId === "boss") {
    const page = Number(url.searchParams.get("page"));
    return url.pathname === "/web/geek/recommend" &&
      url.searchParams.get("sub") === "1" &&
      url.searchParams.get("tag") === "4" &&
      Number.isSafeInteger(page) &&
      page >= firstPage
      ? engagement
      : null;
  }
  return url.pathname === "/user/resume-info/" &&
    url.searchParams.get("subTab") === "1" &&
    url.searchParams.get("mode") === "1"
    ? engagement
    : null;
}

export function isJobEngagementPage(platformId: PlatformId, value: string): boolean {
  return jobEngagementFromPage(platformId, value) !== null;
}

export function isExactJobEngagementPage(
  platformId: PlatformId,
  engagement: PlatformJobEngagementKind,
  page: number,
  value: string,
): boolean {
  const url = parsePlatformWebUrl(platformId, value);
  if (!url || jobEngagementFromPage(platformId, value) !== engagement) {
    return false;
  }
  return platformId !== "boss" || Number(url.searchParams.get("page")) === page;
}
