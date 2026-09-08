import { parsePlatformWebUrl } from "@job-boardwalk/platform-catalog";
import type { PlatformAccessAssessment } from "@job-boardwalk/contracts";
import type { JobCardExtractionConfig, PageAccessFacts, PlatformPageDefinition } from "./types.js";

export const job51EvidenceConfig = {
  jobLinkOrigins: ["https://jobs.51job.com"],
  jobLinkPathPattern: String.raw`^/[^/]+/(?<externalJobId>\d+)\.html$`,
  salaryTextPattern: String.raw`\d+(?:\.\d+)?(?:(?:千|万)(?:元)?)?(?:-\d+(?:\.\d+)?)?(?:(?:千|万)(?:元)?|元)(?:/(?:月|年|天|小时))?(?:·\d+薪)?|面议`,
} as const;

const job51CardExtraction = {
  ...job51EvidenceConfig,
  cardSelector: ".joblist-item",
  companySelectors: [".cname"],
  containerSelectors: [".joblist-item"],
  detailsSelectors: [".tags .tag"],
  educationTextPattern: String.raw`学历不限|初中及以下|中专|高中|大专|本科|硕士|博士`,
  experienceTextPattern: String.raw`无需经验|在校生/应届生|\d+(?:-\d+)?年(?:及以上|经验)?`,
  locationSelectors: [".area"],
  salarySelectors: [".sal"],
  titleSelectors: [".jname"],
} as const satisfies JobCardExtractionConfig;

function matchesLink(href: string | undefined, origin: string, pathname: string): boolean {
  const url = href ? parsePlatformWebUrl("51job", href) : null;
  return url?.origin === origin && url.pathname === pathname;
}

function assess51jobPage(page: PageAccessFacts): PlatformAccessAssessment | null {
  const profileHeader =
    page.elements.some(
      (element) =>
        matchesLink(element.href, "https://we.51job.com", "/pc/my/myjob") &&
        Boolean(element.name?.trim()) &&
        !/登录|注册|我的51Job/u.test(element.name ?? ""),
    ) &&
    page.elements.some(
      (element) =>
        element.name === "在线简历" &&
        matchesLink(element.href, "https://www.51job.com", "/resume/center"),
    );
  const applicationHeader = (
    [
      ["https://login.51job.com", "/logout.php", "退出帐号"],
      ["https://i.51job.com", "/userset/security_center.php", "账号设置"],
      ["https://i.51job.com", "/resume/resume_center.php", "简历中心"],
    ] as const
  ).every(([origin, pathname, name]) =>
    page.elements.some(
      (element) => element.name === name && matchesLink(element.href, origin, pathname),
    ),
  );
  return profileHeader || applicationHeader
    ? { authenticationState: "authenticated", evidence: "authenticated-page" }
    : null;
}

export const job51PageDefinition = {
  assessPage: assess51jobPage,
  isJobCardCollectionPage(value: string): boolean {
    const url = parsePlatformWebUrl("51job", value);
    return Boolean(url && url.hostname === "we.51job.com" && url.pathname === "/pc/search");
  },
  jobCardExtractionConfig: job51CardExtraction,
  jobDescriptionExtractionConfig: {
    companySelectors: [".com_name a", ".com_name"],
    descriptionSelectors: [".job-detail .job_msg"],
    detailsSelectors: [".job-detail .tags .tag"],
    factTextSelectors: [".jTitle", ".job-detail .job_msg", ".job-detail .tags"],
    locationSelectors: [],
    salarySelectors: [],
    titleSelectors: [".jTitle h1"],
  },
  jobLink: job51EvidenceConfig,
} as const satisfies PlatformPageDefinition;
