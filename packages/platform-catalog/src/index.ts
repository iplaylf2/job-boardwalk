export const platformIds = ["boss", "yupao"] as const;

export type PlatformId = (typeof platformIds)[number];

interface PlatformCatalogEntry {
  entryUrl: string;
  label: string;
}

export const platformCatalog = {
  boss: {
    entryUrl: "https://www.zhipin.com/",
    label: "BOSS直聘",
  },
  yupao: {
    entryUrl: "https://www.yupao.com/",
    label: "鱼泡直聘",
  },
} as const satisfies Record<PlatformId, PlatformCatalogEntry>;

export function isPlatformId(value: string): value is PlatformId {
  return platformIds.some((platformId) => platformId === value);
}
