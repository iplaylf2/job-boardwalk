import { parsePlatformWebUrl, resolvePlatformWebUrl } from "@job-boardwalk/platform-catalog";
import type { PlatformAccessAssessment } from "@job-boardwalk/contracts";
import type {
  JobCardExtractionConfig,
  NavigationResponseFacts,
  PageAccessFacts,
  PlatformPageDefinition,
} from "./types.js";
import { bossTextReplacements } from "#/browser/boss-text-replacements.js";

function isBossProtectedPageUrl(url: string): boolean {
  return parsePlatformWebUrl("boss", url)?.pathname.startsWith("/web/geek/") ?? false;
}

function assessBossNavigation(response: NavigationResponseFacts): PlatformAccessAssessment | null {
  if (response.ok && isBossProtectedPageUrl(response.url)) {
    return { authenticationState: "authenticated", evidence: "protected-resource" };
  }
  const current = new URL(response.url);
  const login = new URL(resolvePlatformWebUrl("boss", "login"));
  if (
    current.origin === login.origin &&
    current.pathname === login.pathname &&
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

function isBossJobCardCollectionPage(value: string): boolean {
  const pathname = parsePlatformWebUrl("boss", value)?.pathname;
  return pathname === "/web/geek/job-recommend" || pathname === "/web/geek/jobs";
}

const bossJobLink = {
  jobLinkPathPattern: String.raw`^/job_detail/(?<externalJobId>[^/]+)\.html$`,
} as const;

const bossJobCardExtraction = {
  ...bossJobLink,
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

export const bossPageDefinition = {
  assessNavigation: assessBossNavigation,
  assessPage: assessBossPage,
  isJobCardCollectionPage: isBossJobCardCollectionPage,
  jobCardExtractionConfig: bossJobCardExtraction,
  jobDescriptionExtractionConfig: {
    companySelectors: [
      "a[href*='/gongsi/'][href*='.html']:not([href*='/gongsi/job/'])",
      ".company-info a[href*='/gongsi/']",
    ],
    descriptionSelectors: [".job-sec-text"],
  },
  jobLink: bossJobLink,
} as const satisfies PlatformPageDefinition;
