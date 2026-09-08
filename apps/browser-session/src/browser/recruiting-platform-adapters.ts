import {
  isPlatformId,
  parsePlatformWebUrl,
  platformCatalog,
  platformIds,
  resolvePlatformWebUrl,
} from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import { platformPageDefinitions } from "./platforms/page-definitions.js";
import type {
  JobCardExtractionConfig,
  JobDescriptionExtractionConfig,
  RecruitingPlatformAdapter,
  PlatformPageDefinition,
} from "./platforms/types.js";
import { extractExternalJobId } from "./platform-job-links.js";

function isPlatformJobDetailPage(platformId: PlatformId, value: string): boolean {
  return extractExternalJobId(platformId, value) !== null;
}
function isLoginPageUrl(candidateUrl: string, loginUrl: string): boolean {
  const current = new URL(candidateUrl);
  const login = new URL(loginUrl);
  return current.origin === login.origin && current.pathname === login.pathname;
}

function createRecruitingPlatformAdapter(
  platformId: PlatformId,
  definition: PlatformPageDefinition,
): RecruitingPlatformAdapter {
  const metadata = platformCatalog[platformId];
  const loginUrl = resolvePlatformWebUrl(platformId, "login");
  return {
    ...definition,
    entryUrl: resolvePlatformWebUrl(platformId, "entry"),
    isInNavigationScope(value) {
      return parsePlatformWebUrl(platformId, value) !== null;
    },
    isJobDetailPage: (value) => isPlatformJobDetailPage(platformId, value),
    isLoginPage: (value) => isLoginPageUrl(value, loginUrl),
    label: metadata.label,
    loginUrl,
    platformId,
  };
}

export const recruitingPlatformAdapters = Object.fromEntries(
  platformIds.map((platformId) => [
    platformId,
    createRecruitingPlatformAdapter(platformId, platformPageDefinitions[platformId]),
  ]),
) as Record<PlatformId, RecruitingPlatformAdapter>;

export function readPlatformId(params: Record<string, unknown>): PlatformId {
  const value = params["platformId"];
  if (typeof value !== "string" || !isPlatformId(value)) {
    throw new TypeError(`platformId 必须是受支持的招聘平台：${platformIds.join("、")}。`);
  }
  return value;
}

export function findRecruitingPlatformAdapter(url: string): RecruitingPlatformAdapter | null {
  for (const platformId of platformIds) {
    const adapter = recruitingPlatformAdapters[platformId];
    if (adapter.isInNavigationScope(url)) {
      return adapter;
    }
  }
  return null;
}

export function requireRecruitingPlatformAdapter(url: string): RecruitingPlatformAdapter {
  const adapter = findRecruitingPlatformAdapter(url);
  if (!adapter) {
    throw new Error("URL 必须属于受支持招聘平台的 HTTPS 导航范围。");
  }
  return adapter;
}

export function requireJobCardExtractionConfig(url: string): {
  config: JobCardExtractionConfig;
  platformId: PlatformId;
} {
  const adapter = requireRecruitingPlatformAdapter(url);
  if (!adapter.isJobCardCollectionPage(url)) {
    throw new Error("当前页面不属于岗位卡片采集范围。");
  }
  return {
    config: adapter.jobCardExtractionConfig,
    platformId: adapter.platformId,
  };
}

export function requireJobDetailExtractionConfigs(url: string): {
  cardConfig: JobCardExtractionConfig;
  descriptionConfig: JobDescriptionExtractionConfig;
  platformId: PlatformId;
} {
  const adapter = requireRecruitingPlatformAdapter(url);
  if (!adapter.isJobDetailPage(url)) {
    throw new Error("当前页面不是受支持招聘平台的岗位详情页。");
  }
  return {
    cardConfig: adapter.jobCardExtractionConfig,
    descriptionConfig: adapter.jobDescriptionExtractionConfig,
    platformId: adapter.platformId,
  };
}

export function isJobCardCollectionPage(url: string): boolean {
  return findRecruitingPlatformAdapter(url)?.isJobCardCollectionPage(url) ?? false;
}

export function isJobDetailPage(url: string): boolean {
  return findRecruitingPlatformAdapter(url)?.isJobDetailPage(url) ?? false;
}

export function assertPlatformNavigationUrl(platformId: PlatformId, url: string): void {
  const adapter = recruitingPlatformAdapters[platformId];
  if (!adapter.isInNavigationScope(url)) {
    throw new Error(`URL 必须属于${adapter.label}的 HTTPS 导航范围。`);
  }
}

export function assertPlatformNavigationLink(platformId: PlatformId, href: string): void {
  assertPlatformNavigationUrl(platformId, href);
}
