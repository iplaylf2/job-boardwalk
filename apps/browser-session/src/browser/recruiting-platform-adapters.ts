// oxlint-disable max-lines -- The exhaustive registry keeps platform navigation, access, and extraction contracts auditable together.
import {
  isPlatformId,
  parsePlatformJobEngagementUrl,
  parsePlatformWebUrl,
  platformCatalog,
  platformIds,
  platformJobEngagementKinds,
  resolvePlatformJobEngagementUrl,
  resolvePlatformWebUrl,
} from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import type { PlatformAccessAssessment } from "@job-boardwalk/contracts";

import { bossTextReplacements } from "./boss-text-replacements.js";
import { jobDescriptionExtractionConfigs } from "./job-observation/description-extraction-config.js";
import type { JobDescriptionExtractionConfig } from "./job-observation/description-extraction-config.js";
import { platformJobLinkPathPatterns } from "./platform-job-links.js";

interface NavigationResponseFacts {
  readonly ok: boolean;
  readonly redirectSourceUrls: readonly string[];
  readonly url: string;
}
export interface PageAccessFacts {
  readonly elements: readonly {
    readonly href?: string;
  }[];
  readonly text: string;
  readonly url: string;
}
interface RecruitingPlatformAdapter {
  readonly entryUrl: string;
  readonly label: string;
  readonly loginUrl: string;
  readonly platformId: PlatformId;
  readonly jobCardExtractionConfig: JobCardExtractionConfig;
  readonly jobDescriptionExtractionConfig: JobDescriptionExtractionConfig;
  readonly snapshotSettleMilliseconds?: number;
  readonly isInNavigationScope: (value: string) => boolean;
  readonly isJobCardCollectionPage: (value: string) => boolean;
  readonly isJobDetailPage: (value: string) => boolean;
  readonly assessNavigation?: (
    response: NavigationResponseFacts,
  ) => PlatformAccessAssessment | null;
  readonly assessPage?: (page: PageAccessFacts) => PlatformAccessAssessment | null;
}
export interface JobCardExtractionConfig {
  readonly companySelectors: readonly string[];
  readonly containerSelectors: readonly string[];
  readonly detailsSelectors: readonly string[];
  readonly educationTextPattern?: string;
  readonly excludedTitlePattern?: string;
  readonly jobLinkPathPattern: string;
  readonly locationSelectors: readonly string[];
  readonly requireContainerMatch?: boolean;
  readonly salarySelectors: readonly string[];
  readonly salaryTextPattern?: string;
  readonly textReplacements?: Readonly<Record<string, string>>;
  readonly experienceTextPattern?: string;
  readonly titleBoundaryPattern?: string;
  readonly titleFromFirstLine?: boolean;
  readonly titleSelectors: readonly string[];
}
function isPlatformJobDetailPage(platformId: PlatformId, value: string): boolean {
  const url = parsePlatformWebUrl(platformId, value);
  return Boolean(
    url && new RegExp(platformJobLinkPathPatterns[platformId], "u").test(url.pathname),
  );
}
function isLoginPageUrl(candidateUrl: string, loginUrl: string): boolean {
  const current = new URL(candidateUrl);
  const login = new URL(loginUrl);
  return current.origin === login.origin && current.pathname === login.pathname;
}

function isBossProtectedPageUrl(url: string): boolean {
  return parsePlatformWebUrl("boss", url)?.pathname.startsWith("/web/geek/") ?? false;
}

function assessBossNavigation(response: NavigationResponseFacts): PlatformAccessAssessment | null {
  if (response.ok && isBossProtectedPageUrl(response.url)) {
    return { authenticationState: "authenticated", evidence: "protected-resource" };
  }
  if (
    isLoginPageUrl(response.url, resolvePlatformWebUrl("boss", "login")) &&
    response.redirectSourceUrls.some(isBossProtectedPageUrl)
  ) {
    return { authenticationState: "unauthenticated", evidence: "login-redirect" };
  }
  return null;
}

function isBossAccountLink(href: string | undefined, pathname: string): boolean {
  if (!href) {
    return false;
  }
  return parsePlatformWebUrl("boss", href)?.pathname === pathname;
}

function assessBossPage(page: PageAccessFacts): PlatformAccessAssessment | null {
  const requiredAccountPaths = [
    "/web/geek/chat",
    "/web/geek/resume",
    "/web/geek/recommend",
  ] as const;
  const showsAuthenticatedNavigation = requiredAccountPaths.every((pathname) =>
    page.elements.some((element) => isBossAccountLink(element.href, pathname)),
  );
  return showsAuthenticatedNavigation
    ? { authenticationState: "authenticated", evidence: "authenticated-page" }
    : null;
}

function assessYupaoPage(page: PageAccessFacts): PlatformAccessAssessment | null {
  const maximumHeaderLines = 20;
  const emptyLineCount = 0;
  const firstLineIndex = 0;
  const nextLineOffset = 1;
  const resumeLineOffset = 2;
  const loginLabelFragments = ["登录", "注册"] as const;
  const requiredNavigationLabels = ["首页", "职位", "公司", "校园"] as const;
  const headerLines = page.text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > emptyLineCount)
    .slice(firstLineIndex, maximumHeaderLines);
  const messageLineIndex = headerLines.findIndex(
    (line, index) =>
      line === "消息" &&
      headerLines[index + nextLineOffset] === "简历" &&
      Boolean(headerLines[index + resumeLineOffset]),
  );
  if (messageLineIndex < firstLineIndex) {
    return null;
  }
  const identity = headerLines[messageLineIndex + resumeLineOffset];
  const headerNavigation = new Set(headerLines.slice(firstLineIndex, messageLineIndex));
  const showsYupaoHeader = requiredNavigationLabels.every((label) => headerNavigation.has(label));
  const hasAccountIdentity =
    showsYupaoHeader &&
    Boolean(identity) &&
    !loginLabelFragments.some((fragment) => identity?.includes(fragment));
  return hasAccountIdentity
    ? { authenticationState: "authenticated", evidence: "authenticated-page" }
    : null;
}

function isYupaoJobCardCollectionPage(value: string): boolean {
  const url = parsePlatformWebUrl("yupao", value);
  return (
    url !== null &&
    !isPlatformJobDetailPage("yupao", value) &&
    !platformJobEngagementKinds.some(
      (engagement) =>
        url.pathname === new URL(resolvePlatformJobEngagementUrl("yupao", engagement)).pathname,
    )
  );
}

function createRecruitingPlatformAdapter(platformId: PlatformId): RecruitingPlatformAdapter {
  const metadata = platformCatalog[platformId];
  return {
    entryUrl: resolvePlatformWebUrl(platformId, "entry"),
    isInNavigationScope(value) {
      return parsePlatformWebUrl(platformId, value) !== null;
    },
    isJobCardCollectionPage(value) {
      return (
        parsePlatformWebUrl(platformId, value) !== null &&
        !isPlatformJobDetailPage(platformId, value) &&
        parsePlatformJobEngagementUrl(platformId, value) === null
      );
    },
    isJobDetailPage: (value) => isPlatformJobDetailPage(platformId, value),
    jobCardExtractionConfig: platformId === "boss" ? bossJobCardExtraction : yupaoJobCardExtraction,
    jobDescriptionExtractionConfig: jobDescriptionExtractionConfigs[platformId],
    label: metadata.label,
    loginUrl: resolvePlatformWebUrl(platformId, "login"),
    platformId,
  };
}

const bossJobCardExtraction = {
  companySelectors: [
    "a[href*='/gongsi/']",
    ".company-name",
    "[class*='company-name']",
    "[class*='companyName']",
  ],
  containerSelectors: [".job-card-wrapper", ".job-card-box", ".job-list-box > li"],
  detailsSelectors: [".tag-list li", ".job-card-footer li"],
  educationTextPattern: String.raw`学历不限|初中及以下|中专(?:/中技)?|高中|大专|本科|硕士|博士`,
  experienceTextPattern: String.raw`经验不限|在校/应届|1年以内|1-3年|3-5年|5-10年|10年以上`,
  jobLinkPathPattern: platformJobLinkPathPatterns.boss,
  locationSelectors: [
    ".job-area",
    ".job-location",
    "[class*='job-area']",
    "[class*='jobArea']",
    "[class*='location']",
  ],
  requireContainerMatch: true,
  salarySelectors: [".salary"],
  salaryTextPattern: String.raw`\d+(?:-\d+)?K(?:·\d+薪)?|\d+(?:-\d+)?元/(?:天|小时)|面议`,
  textReplacements: bossTextReplacements,
  titleSelectors: [".job-name", ".job-title"],
} as const satisfies JobCardExtractionConfig;

const yupaoSnapshotSettleMilliseconds = 1000;

const yupaoJobCardExtraction = {
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
  jobLinkPathPattern: platformJobLinkPathPatterns.yupao,
  locationSelectors: [
    ".job-area",
    ".job-location",
    ".address",
    "[class*='address']",
    "[class*='area']",
    "[class*='location']",
  ],
  salarySelectors: [".salary", "[class*='salary']"],
  salaryTextPattern: String.raw`\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?万元/月|\d+(?:-\d+)?元/(?:月|天|小时)|薪资面议|面议`,
  titleBoundaryPattern: String.raw`\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?万元/月|\d+(?:-\d+)?元/(?:月|天|小时)|薪资面议|面议|经验不限|在校/应届|1年以内|1-3年|3-5年|5-10年|10年以上|学历不限|初中及以下|中专(?:/中技)?|高中|大专|本科|硕士|博士`,
  titleFromFirstLine: true,
  titleSelectors: [".job-name", ".job-title", "[class*='job-name']", "[class*='job-title']"],
} as const satisfies JobCardExtractionConfig;

export const recruitingPlatformAdapters = {
  boss: {
    ...createRecruitingPlatformAdapter("boss"),
    assessNavigation: assessBossNavigation,
    assessPage: assessBossPage,
  },
  yupao: {
    ...createRecruitingPlatformAdapter("yupao"),
    assessPage: assessYupaoPage,
    isJobCardCollectionPage: isYupaoJobCardCollectionPage,
    snapshotSettleMilliseconds: yupaoSnapshotSettleMilliseconds,
  },
} as const satisfies Record<PlatformId, RecruitingPlatformAdapter>;

export function readPlatformId(params: Record<string, unknown>): PlatformId {
  const value = params["platformId"];
  if (typeof value !== "string" || !isPlatformId(value)) {
    throw new TypeError(`platformId 必须是受支持的招聘平台：${platformIds.join("、")}。`);
  }
  return value;
}

export function findRecruitingPlatformAdapter(url: string): RecruitingPlatformAdapter | null {
  for (const platformId of platformIds) {
    const adapter = recruitingPlatformAdapters[platformId];
    if (adapter.isInNavigationScope(url)) {
      return adapter;
    }
  }
  return null;
}

export function requireRecruitingPlatformAdapter(url: string): RecruitingPlatformAdapter {
  const adapter = findRecruitingPlatformAdapter(url);
  if (!adapter) {
    throw new Error("URL 必须属于受支持招聘平台的 HTTPS 导航范围。");
  }
  return adapter;
}

export function requireJobCardExtractionConfig(url: string): {
  config: JobCardExtractionConfig;
  platformId: PlatformId;
} {
  const adapter = requireRecruitingPlatformAdapter(url);
  if (!adapter.isJobCardCollectionPage(url)) {
    throw new Error("当前页面不属于岗位卡片采集范围。");
  }
  return {
    config: adapter.jobCardExtractionConfig,
    platformId: adapter.platformId,
  };
}

export function requireJobDetailExtractionConfigs(url: string): {
  cardConfig: JobCardExtractionConfig;
  descriptionConfig: JobDescriptionExtractionConfig;
  platformId: PlatformId;
} {
  const adapter = requireRecruitingPlatformAdapter(url);
  if (!adapter.isJobDetailPage(url)) {
    throw new Error("当前页面不是受支持招聘平台的岗位详情页。");
  }
  return {
    cardConfig: adapter.jobCardExtractionConfig,
    descriptionConfig: adapter.jobDescriptionExtractionConfig,
    platformId: adapter.platformId,
  };
}

export function isJobCardCollectionPage(url: string): boolean {
  return findRecruitingPlatformAdapter(url)?.isJobCardCollectionPage(url) ?? false;
}

export function isJobDetailPage(url: string): boolean {
  return findRecruitingPlatformAdapter(url)?.isJobDetailPage(url) ?? false;
}

export function assertPlatformNavigationUrl(platformId: PlatformId, url: string): void {
  const adapter = recruitingPlatformAdapters[platformId];
  if (!adapter.isInNavigationScope(url)) {
    throw new Error(`URL 必须属于${adapter.label}的 HTTPS 导航范围。`);
  }
}

export function assertPlatformNavigationLink(platformId: PlatformId, href: string): void {
  assertPlatformNavigationUrl(platformId, href);
}
