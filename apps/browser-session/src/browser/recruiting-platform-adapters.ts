import {
  isPlatformId,
  platformCatalog,
  platformIds,
  resolvePlatformWebUrl,
} from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import type { PlatformAccessAssessment } from "@job-boardwalk/contracts";

// eslint-disable-next-line no-script-url
const scriptUrlProtocol = "javascript:";

interface NavigationResponseFacts {
  readonly ok: boolean;
  readonly redirectSourceUrls: readonly string[];
  readonly url: string;
}

export interface PageAccessFacts {
  readonly elements: readonly {
    readonly href?: string;
  }[];
  readonly url: string;
}

interface RecruitingPlatformAdapter {
  readonly entryUrl: string;
  readonly label: string;
  readonly loginUrl: string;
  readonly platformId: PlatformId;
  readonly isInNavigationScope: (value: string) => boolean;
  readonly assessNavigation?: (
    response: NavigationResponseFacts,
  ) => PlatformAccessAssessment | null;
  readonly assessPage?: (page: PageAccessFacts) => PlatformAccessAssessment | null;
}

function isLoginPageUrl(candidateUrl: string, loginUrl: string): boolean {
  const current = new URL(candidateUrl);
  const login = new URL(loginUrl);
  return current.origin === login.origin && current.pathname === login.pathname;
}

function isBossProtectedPageUrl(url: string): boolean {
  const parsed = new URL(url);
  const { navigationDomain } = platformCatalog.boss.web;
  return (
    (parsed.hostname === navigationDomain || parsed.hostname.endsWith(`.${navigationDomain}`)) &&
    parsed.pathname.startsWith("/web/geek/")
  );
}

function assessBossNavigation(response: NavigationResponseFacts): PlatformAccessAssessment | null {
  if (response.ok && isBossProtectedPageUrl(response.url)) {
    return { authenticationState: "authenticated", evidence: "protected-resource" };
  }
  if (
    isLoginPageUrl(response.url, resolvePlatformWebUrl("boss", "login")) &&
    response.redirectSourceUrls.some(isBossProtectedPageUrl)
  ) {
    return { authenticationState: "unauthenticated", evidence: "login-redirect" };
  }
  return null;
}

function isBossAccountLink(href: string | undefined, pathname: string): boolean {
  if (!href) {
    return false;
  }
  try {
    const url = new URL(href);
    const { navigationDomain } = platformCatalog.boss.web;
    return (
      url.protocol === "https:" &&
      (url.hostname === navigationDomain || url.hostname.endsWith(`.${navigationDomain}`)) &&
      url.pathname === pathname
    );
  } catch {
    return false;
  }
}

function assessBossPage(page: PageAccessFacts): PlatformAccessAssessment | null {
  const requiredAccountPaths = [
    "/web/geek/chat",
    "/web/geek/resume",
    "/web/geek/recommend",
  ] as const;
  const showsAuthenticatedNavigation = requiredAccountPaths.every((pathname) =>
    page.elements.some((element) => isBossAccountLink(element.href, pathname)),
  );
  return showsAuthenticatedNavigation
    ? { authenticationState: "authenticated", evidence: "authenticated-page" }
    : null;
}

function createRecruitingPlatformAdapter(platformId: PlatformId): RecruitingPlatformAdapter {
  const metadata = platformCatalog[platformId];
  const { navigationDomain } = metadata.web;
  return {
    entryUrl: resolvePlatformWebUrl(platformId, "entry"),
    isInNavigationScope(value) {
      try {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          (url.hostname === navigationDomain || url.hostname.endsWith(`.${navigationDomain}`))
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
  boss: {
    ...createRecruitingPlatformAdapter("boss"),
    assessNavigation: assessBossNavigation,
    assessPage: assessBossPage,
  },
  yupao: createRecruitingPlatformAdapter("yupao"),
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

export function assertPlatformNavigationUrl(platformId: PlatformId, url: string): void {
  const adapter = recruitingPlatformAdapters[platformId];
  if (!adapter.isInNavigationScope(url)) {
    throw new Error(`URL 必须属于${adapter.label}的 HTTPS 导航范围。`);
  }
}

export function assertPlatformNavigationLink(platformId: PlatformId, href: string): void {
  const url = new URL(href);
  if (url.protocol !== scriptUrlProtocol) {
    assertPlatformNavigationUrl(platformId, href);
  }
}
