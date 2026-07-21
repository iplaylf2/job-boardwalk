export const platformIds = ["boss", "yupao"] as const;

export type PlatformId = (typeof platformIds)[number];
export type PlatformWebDestination = "entry" | "interestList" | "login";
type PlatformWebOrigin = `https://${string}`;
type PlatformWebPath = `/${string}`;

interface PlatformCatalogEntry {
  label: string;
  web: {
    destinations: Record<PlatformWebDestination, PlatformWebPath>;
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
        interestList: "/web/geek/recommend?tab=4&sub=1&page=1&tag=4",
        login: "/web/user/",
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
        interestList: "/user/resume-info/?tab=4&subTab=1&mode=1",
        login: "/web/login/",
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

export function parsePlatformWebUrl(platformId: PlatformId, value: string): URL | null {
  try {
    // oxlint-disable-next-line no-undef -- URL is available in both browser and Node runtimes.
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

export function isPlatformId(value: string): value is PlatformId {
  return platformIds.some((platformId) => platformId === value);
}
