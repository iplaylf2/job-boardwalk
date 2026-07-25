import type { PlatformId } from "@job-boardwalk/platform-catalog";

export interface JobDescriptionExtractionConfig {
  readonly companySelectors: readonly string[];
  readonly descriptionSelectors: readonly string[];
  readonly descriptionTextBoundary?: {
    readonly after: string;
    readonly before: string;
  };
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
    descriptionTextBoundary: {
      after: "职位说明：",
      before: "职位总结",
    },
  },
} as const satisfies Record<PlatformId, JobDescriptionExtractionConfig>;
