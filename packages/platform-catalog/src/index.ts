export const platformIds = ["boss", "yupao", "51job"] as const;
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
type PlatformWebUrl = `https://${string}`;
const firstPage = 1;

interface PlatformJobEngagementPagination {
  firstPage: number;
  parameter: string;
}

interface PlatformCatalogEntry {
  label: string;
  web: {
    destinations: Record<PlatformWebDestination, PlatformWebUrl>;
    jobEngagement: {
      pagination: PlatformJobEngagementPagination | null;
      destinations: Record<PlatformJobEngagementKind, PlatformWebUrl | null>;
    };
    navigationDomain: string;
    origin: PlatformWebOrigin;
  };
}

export const platformCatalog = {
  "51job": {
    label: "前程无忧51job",
    web: {
      destinations: {
        entry: "https://www.51job.com/",
        login: "https://login.51job.com/login.php",
      },
      jobEngagement: {
        destinations: {
          applied: "https://i.51job.com/userset/my_apply.php?type=sh&tagType=&lang=c",
          contacted: null,
          interested: "https://www.51job.com/userset/my_collection",
          interviewed: "https://i.51job.com/userset/my_apply.php?type=sh&tagType=ms&lang=c",
        },
        pagination: null,
      },
      navigationDomain: "51job.com",
      origin: "https://www.51job.com",
    },
  },
  boss: {
    label: "BOSS直聘",
    web: {
      destinations: {
        entry: "https://www.zhipin.com/",
        login: "https://www.zhipin.com/web/user/",
      },
      jobEngagement: {
        destinations: {
          applied: "https://www.zhipin.com/web/geek/recommend?tab=2&page=1&tag=5",
          contacted: "https://www.zhipin.com/web/geek/recommend?tab=1&page=1&tag=5",
          interested: "https://www.zhipin.com/web/geek/recommend?tab=4&sub=1&page=1&tag=4",
          interviewed: "https://www.zhipin.com/web/geek/recommend?tab=3&page=1&tag=5",
        },
        pagination: { firstPage, parameter: "page" },
      },
      navigationDomain: "zhipin.com",
      origin: "https://www.zhipin.com",
    },
  },
  yupao: {
    label: "鱼泡直聘",
    web: {
      destinations: {
        entry: "https://www.yupao.com/",
        login: "https://www.yupao.com/web/login/",
      },
      jobEngagement: {
        destinations: {
          applied: "https://www.yupao.com/user/resume-info/?tab=2&subTab=1&mode=1",
          contacted: "https://www.yupao.com/user/resume-info/?tab=1&subTab=1&mode=1",
          interested: "https://www.yupao.com/user/resume-info/?tab=4&subTab=1&mode=1",
          interviewed: "https://www.yupao.com/user/resume-info/?tab=3&subTab=1&mode=1",
        },
        pagination: null,
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
  return platformCatalog[platformId].web.destinations[destination];
}

export function resolvePlatformJobEngagementUrl(
  platformId: PlatformId,
  engagement: PlatformJobEngagementKind,
): string {
  const destination = platformCatalog[platformId].web.jobEngagement.destinations[engagement];
  if (!destination) {
    throw new Error(`${platformCatalog[platformId].label}不支持此岗位跟进类别。`);
  }
  return destination;
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
  const { jobEngagement } = platformCatalog[platformId].web;
  const { pagination } = jobEngagement;
  for (const engagement of platformJobEngagementKinds) {
    const destination = jobEngagement.destinations[engagement];
    if (!destination) {
      continue;
    }
    const expected = new URL(destination);
    if (url.origin !== expected.origin || url.pathname !== expected.pathname) {
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
