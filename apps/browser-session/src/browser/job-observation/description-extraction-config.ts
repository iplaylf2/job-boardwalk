import type { PlatformId } from "@job-boardwalk/platform-catalog";

export interface JobDescriptionExtractionConfig {
  readonly companySelectors: readonly string[];
  readonly descriptionSelectors: readonly string[];
  readonly descriptionTextRanges?: readonly {
    readonly endMarker: string;
    readonly includeStartMarker?: boolean;
    readonly startMarker: string;
  }[];
  readonly titleLineBeforeMarker?: string;
}

export const jobDescriptionExtractionConfigs = {
  boss: {
    companySelectors: [
      "a[href*='/gongsi/'][href*='.html']:not([href*='/gongsi/job/'])",
      ".company-info a[href*='/gongsi/']",
    ],
    descriptionSelectors: [".job-sec-text"],
  },
  yupao: {
    companySelectors: ["a[href*='/qiye/'][href*='.html']", ".company-info a[href*='/qiye/']"],
    descriptionSelectors: [
      ".job-detail-content",
      "[class*='job-detail-content']",
      "[class*='job-content']",
    ],
    descriptionTextRanges: [
      { endMarker: "职位总结", startMarker: "职位说明：" },
      { endMarker: "职位总结", includeStartMarker: true, startMarker: "岗位职责：" },
    ],
    titleLineBeforeMarker: "岗位职责：",
  },
} as const satisfies Record<PlatformId, JobDescriptionExtractionConfig>;
