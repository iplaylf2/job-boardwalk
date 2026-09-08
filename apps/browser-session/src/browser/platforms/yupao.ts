import { parsePlatformWebUrl } from "@job-boardwalk/platform-catalog";
import type { PlatformAccessAssessment } from "@job-boardwalk/contracts";
import type { JobCardExtractionConfig, PageAccessFacts, PlatformPageDefinition } from "./types.js";

const emptyVisibleEvidenceLength = 0;
const firstHeaderLineIndex = 0;
const identityHeaderLineOffset = 2;
const maximumYupaoHeaderLines = 30;
const nextHeaderLineOffset = 1;
const yupaoLoginLabelFragments = ["登录", "注册"] as const;
const yupaoRecruiterIdentityAnchor = ["账号权益", "升级VIP"] as const;
const yupaoRecruiterNavigationLabels = [
  "职位管理",
  "推荐牛人",
  "搜索牛人",
  "沟通",
  "公司管理",
] as const;
const yupaoSeekerIdentityAnchor = ["消息", "简历"] as const;
const yupaoSeekerNavigationLabels = ["首页", "职位", "公司", "校园"] as const;

function yupaoHeaderLines(text: string): string[] {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > emptyVisibleEvidenceLength)
    .slice(firstHeaderLineIndex, maximumYupaoHeaderLines);
}

function hasYupaoAuthenticatedSurface(
  headerLines: readonly string[],
  identityAnchor: readonly [string, string],
  requiredNavigationLabels: readonly string[],
): boolean {
  const identityAnchorIndex = headerLines.findIndex(
    (line, index) =>
      line === identityAnchor[firstHeaderLineIndex] &&
      headerLines[index + nextHeaderLineOffset] === identityAnchor[nextHeaderLineOffset] &&
      Boolean(headerLines[index + identityHeaderLineOffset]),
  );
  if (identityAnchorIndex < firstHeaderLineIndex) {
    return false;
  }
  const identity = headerLines[identityAnchorIndex + identityHeaderLineOffset];
  const navigation = new Set(headerLines.slice(firstHeaderLineIndex, identityAnchorIndex));
  return (
    requiredNavigationLabels.every((label) => navigation.has(label)) &&
    Boolean(identity) &&
    !yupaoLoginLabelFragments.some((fragment) => identity?.includes(fragment))
  );
}

function assessYupaoPage(page: PageAccessFacts): PlatformAccessAssessment | null {
  const headerLines = yupaoHeaderLines(page.text);
  const hasAuthenticatedSurface =
    hasYupaoAuthenticatedSurface(
      headerLines,
      yupaoSeekerIdentityAnchor,
      yupaoSeekerNavigationLabels,
    ) ||
    hasYupaoAuthenticatedSurface(
      headerLines,
      yupaoRecruiterIdentityAnchor,
      yupaoRecruiterNavigationLabels,
    );
  return hasAuthenticatedSurface
    ? { authenticationState: "authenticated", evidence: "authenticated-page" }
    : null;
}

function isYupaoJobCardCollectionPage(value: string): boolean {
  const url = parsePlatformWebUrl("yupao", value);
  if (!url || new RegExp(yupaoJobLink.jobLinkPathPattern, "u").test(url.pathname)) {
    return false;
  }
  return (
    /^\/topic\/[^/]+\/?$/u.test(url.pathname) || /^\/zhaogong\/(?:[^/]+\/?)?$/u.test(url.pathname)
  );
}

const yupaoSnapshotSettleMilliseconds = 1000;

const yupaoJobLink = {
  jobLinkPathPattern: String.raw`^/zhaogong/(?<externalJobId>\d+)(?:/[^/]+)?\.html$`,
} as const;

const yupaoJobCardExtraction = {
  ...yupaoJobLink,
  companySelectors: [
    "a[href*='/qiye/']",
    ".company-name",
    "[class*='company-name']",
    "[class*='companyName']",
  ],
  containerSelectors: [
    ".job-card",
    ".job-item",
    "[class*='job-card']",
    "[class*='job-item']",
    "[class*='position-card']",
    "li",
  ],
  detailsSelectors: [".tag-list li", "[class*='tag']"],
  educationTextPattern: String.raw`学历不限|初中及以下|中专(?:/中技)?|高中|大专|本科|硕士|博士`,
  excludedTitlePattern: String.raw`^查看更多(?:信息)?$`,
  experienceTextPattern: String.raw`经验不限|在校/应届|1年以内|1-3年|3-5年|5-10年|10年以上`,
  locationSelectors: [
    ".job-area",
    ".job-location",
    ".address",
    "[class*='address']",
    "[class*='area']",
    "[class*='location']",
  ],
  salarySelectors: [".salary"],
  salaryTextPattern: String.raw`\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?万元/月|\d+(?:-\d+)?元/(?:月|天|小时)|薪资面议|面议`,
  titleBoundaryPattern: String.raw`\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?万元/月|\d+(?:-\d+)?元/(?:月|天|小时)|薪资面议|面议|经验不限|在校/应届|1年以内|1-3年|3-5年|5-10年|10年以上|学历不限|初中及以下|中专(?:/中技)?|高中|大专|本科|硕士|博士`,
  titleFromFirstLine: true,
  titleSelectors: [".job-name", ".job-title", "[class*='job-name']", "[class*='job-title']"],
} as const satisfies JobCardExtractionConfig;

export const yupaoPageDefinition = {
  assessPage: assessYupaoPage,
  isJobCardCollectionPage: isYupaoJobCardCollectionPage,
  jobCardExtractionConfig: yupaoJobCardExtraction,
  jobDescriptionExtractionConfig: {
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
  jobLink: yupaoJobLink,
  snapshotSettleMilliseconds: yupaoSnapshotSettleMilliseconds,
} as const satisfies PlatformPageDefinition;
