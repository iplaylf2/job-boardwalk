export const platformIds = ["boss", "yupao"] as const;

export type PlatformId = (typeof platformIds)[number];

interface PlatformCatalogEntry {
  label: string;
}

export const platformCatalog = {
  boss: {
    label: "BOSS直聘",
  },
  yupao: {
    label: "鱼泡直聘",
  },
} as const satisfies Record<PlatformId, PlatformCatalogEntry>;

export function isPlatformId(value: string): value is PlatformId {
  return platformIds.some((platformId) => platformId === value);
}
