import type { PlatformId } from "@job-boardwalk/platform-catalog";
import { bossPageDefinition } from "./boss.js";
import { yupaoPageDefinition } from "./yupao.js";
import { job51PageDefinition } from "./51job.js";
import type { PlatformPageDefinition } from "./types.js";

export const platformPageDefinitions = {
  "51job": job51PageDefinition,
  boss: bossPageDefinition,
  yupao: yupaoPageDefinition,
} as const satisfies Record<PlatformId, PlatformPageDefinition>;
