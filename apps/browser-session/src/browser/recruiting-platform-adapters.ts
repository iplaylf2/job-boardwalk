import {
  isPlatformId,
  platformCatalog,
  platformIds,
  resolvePlatformWebUrl,
} from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";

// eslint-disable-next-line no-script-url
const scriptUrlProtocol = "javascript:";

export interface RecruitingPlatformAdapter {
  readonly entryUrl: string;
  readonly label: string;
  readonly loginUrl: string;
  readonly platformId: PlatformId;
  readonly isNavigationUrl: (value: string) => boolean;
}

function platformAdapter(platformId: PlatformId): RecruitingPlatformAdapter {
  const metadata = platformCatalog[platformId];
  const hostnameSuffix = metadata.web.navigationDomain;
  return {
    entryUrl: resolvePlatformWebUrl(platformId, "entry"),
    isNavigationUrl(value) {
      try {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          (url.hostname === hostnameSuffix || url.hostname.endsWith(`.${hostnameSuffix}`))
        );
      } catch {
        return false;
      }
    },
    label: metadata.label,
    loginUrl: resolvePlatformWebUrl(platformId, "login"),
    platformId,
  };
}

export const recruitingPlatformAdapters = {
  boss: platformAdapter("boss"),
  yupao: platformAdapter("yupao"),
} as const satisfies Record<PlatformId, RecruitingPlatformAdapter>;

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
    if (adapter.isNavigationUrl(url)) {
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

export function assertPlatformNavigationUrl(platformId: PlatformId, url: string): void {
  const adapter = recruitingPlatformAdapters[platformId];
  if (!adapter.isNavigationUrl(url)) {
    throw new Error(`URL 必须属于${adapter.label}的 HTTPS 导航范围。`);
  }
}

export function assertPlatformNavigationLink(platformId: PlatformId, href: string): void {
  const url = new URL(href);
  if (url.protocol !== scriptUrlProtocol) {
    assertPlatformNavigationUrl(platformId, href);
  }
}
