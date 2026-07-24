export const platformIds = ["boss", "yupao"] as const;
export const platformJobEngagementKinds = [
  "contacted",
  "applied",
  "interviewed",
  "interested",
] as const;

export type PlatformId = (typeof platformIds)[number];
export type PlatformJobEngagementKind = (typeof platformJobEngagementKinds)[number];
export type PlatformWebDestination = "entry" | "login";
type PlatformWebOrigin = `https://${string}`;
type PlatformWebPath = `/${string}`;
const firstPage = 1;

interface PlatformJobEngagementPagination {
  firstPage: number;
  parameter: string;
}

interface PlatformCatalogEntry {
  label: string;
  web: {
    destinations: Record<PlatformWebDestination, PlatformWebPath>;
    jobEngagement: {
      pagination: PlatformJobEngagementPagination | null;
      paths: Record<PlatformJobEngagementKind, PlatformWebPath>;
    };
    navigationDomain: string;
    origin: PlatformWebOrigin;
  };
}

export const platformCatalog = {
  boss: {
    label: "BOSS直聘",
    web: {
      destinations: {
        entry: "/",
        login: "/web/user/",
      },
      jobEngagement: {
        pagination: { firstPage, parameter: "page" },
        paths: {
          applied: "/web/geek/recommend?tab=2&sub=1&page=1&tag=4",
          contacted: "/web/geek/recommend?tab=1&sub=1&page=1&tag=4",
          interested: "/web/geek/recommend?tab=4&sub=1&page=1&tag=4",
          interviewed: "/web/geek/recommend?tab=3&sub=1&page=1&tag=4",
        },
      },
      navigationDomain: "zhipin.com",
      origin: "https://www.zhipin.com",
    },
  },
  yupao: {
    label: "鱼泡直聘",
    web: {
      destinations: {
        entry: "/",
        login: "/web/login/",
      },
      jobEngagement: {
        pagination: null,
        paths: {
          applied: "/user/resume-info/?tab=2&subTab=1&mode=1",
          contacted: "/user/resume-info/?tab=1&subTab=1&mode=1",
          interested: "/user/resume-info/?tab=4&subTab=1&mode=1",
          interviewed: "/user/resume-info/?tab=3&subTab=1&mode=1",
        },
      },
      navigationDomain: "yupao.com",
      origin: "https://www.yupao.com",
    },
  },
} as const satisfies Record<PlatformId, PlatformCatalogEntry>;

export function resolvePlatformWebUrl(
  platformId: PlatformId,
  destination: PlatformWebDestination,
): string {
  const { destinations, origin } = platformCatalog[platformId].web;
  return `${origin}${destinations[destination]}`;
}

export function resolvePlatformJobEngagementUrl(
  platformId: PlatformId,
  engagement: PlatformJobEngagementKind,
): string {
  const { jobEngagement, origin } = platformCatalog[platformId].web;
  return `${origin}${jobEngagement.paths[engagement]}`;
}

export function parsePlatformWebUrl(platformId: PlatformId, value: string): URL | null {
  try {
    const url = new URL(value);
    const { navigationDomain } = platformCatalog[platformId].web;
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === navigationDomain || url.hostname.endsWith(`.${navigationDomain}`))
      ? url
      : null;
  } catch {
    return null;
  }
}

export function parsePlatformJobEngagementUrl(
  platformId: PlatformId,
  value: string,
): PlatformJobEngagementKind | null {
  const url = parsePlatformWebUrl(platformId, value);
  if (!url) {
    return null;
  }
  const { pagination } = platformCatalog[platformId].web.jobEngagement;
  for (const engagement of platformJobEngagementKinds) {
    const expected = new URL(resolvePlatformJobEngagementUrl(platformId, engagement));
    if (url.pathname !== expected.pathname) {
      continue;
    }
    const matchesParameters = [...expected.searchParams].every(([name, expectedValue]) => {
      if (pagination?.parameter === name) {
        const page = Number(url.searchParams.get(name));
        return Number.isSafeInteger(page) && page >= pagination.firstPage;
      }
      return url.searchParams.get(name) === expectedValue;
    });
    if (matchesParameters) {
      return engagement;
    }
  }
  return null;
}

export function isPlatformId(value: string): value is PlatformId {
  return platformIds.some((platformId) => platformId === value);
}

export function isPlatformJobEngagementKind(value: string): value is PlatformJobEngagementKind {
  return platformJobEngagementKinds.some((engagement) => engagement === value);
}
