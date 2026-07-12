export const platformNames = ["boss", "yupao"] as const;

export type PlatformName = (typeof platformNames)[number];

export const platformCatalog = {
  boss: { label: "BOSS直聘" },
  yupao: { label: "鱼泡直聘" },
} as const satisfies Record<PlatformName, { label: string }>;

export interface LoginReceipt {
  authenticatedAt: string;
  platform: PlatformName;
  state: "persisted";
}
