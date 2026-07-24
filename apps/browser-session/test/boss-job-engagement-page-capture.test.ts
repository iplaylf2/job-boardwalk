import { afterEach, expect, test, vi } from "vitest";

import { captureBossJobEngagementMetadata } from "#/browser/job-engagement/boss-page-capture.js";
import { maximumJobsPerEngagementScan } from "#/browser/job-engagement/scan-limit.js";

const maximumSummaryCharacters = 1500;
const pageCaptureLimits = {
  maximumCards: maximumJobsPerEngagementScan,
  maximumSummaryCharacters,
};

function textElement(textContent: string): Element {
  return { textContent } as Element;
}

function personalJobCard(): { container: Element; link: HTMLAnchorElement } {
  const company = textElement("示例软件己");
  const links: HTMLAnchorElement[] = [];
  const container = {
    innerText:
      "示例招聘者 HRBP\n示例软件己\n互联网 B轮 100-499人\n.NET平台工程师\n[北京·海淀区·示例园]\n21-29K·13薪 3-5年 本科",
    parentElement: null,
    querySelector: (selector: string) => (selector === "a[href*='/gongsi/']" ? company : null),
    querySelectorAll: () => links,
    textContent:
      "示例招聘者 HRBP 示例软件己 互联网 B轮 100-499人 .NET平台工程师 [北京·海淀区·示例园] 21-29K·13薪 3-5年 本科",
  } as unknown as Element;
  const link = {
    href: "https://www.zhipin.com/job_detail/stable-id.html?securityId=rotating&ka=personal_submitted_job_stable-id",
    innerText: ".NET平台工程师[北京·海淀区·示例园]",
    parentElement: container,
    textContent: ".NET平台工程师[北京·海淀区·示例园]",
  } as unknown as HTMLAnchorElement;
  links.push(link);
  return { container, link };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("extracts BOSS personal-center jobs from semantic links instead of discovery-card classes", () => {
  const { link } = personalJobCard();
  vi.stubGlobal("document", {
    body: { innerText: "累计投递简历数量1" },
    querySelectorAll: () => [link],
  });
  vi.stubGlobal("location", {
    href: "https://www.zhipin.com/web/geek/recommend?tab=2&sub=1&page=1&tag=4",
    origin: "https://www.zhipin.com",
  });

  const metadata = captureBossJobEngagementMetadata(pageCaptureLimits);

  expect(metadata.jobs).toEqual([
    expect.objectContaining({
      company: "示例软件己",
      educationRequirement: "本科",
      experienceRequirement: "3-5年",
      externalJobId: "stable-id",
      location: "北京·海淀区·示例园",
      salaryText: "21-29K·13薪",
      title: ".NET平台工程师",
    }),
  ]);
});

test("ignores detail links without a valid same-origin personal-center engagement marker", () => {
  const { link } = personalJobCard();
  const unrelated = {
    ...link,
    href: "https://www.zhipin.com/job_detail/sidebar.html?securityId=rotating",
  } as HTMLAnchorElement;
  const malformedMarker = {
    ...link,
    href: "https://www.zhipin.com/job_detail/stable-id.html?ka=personal_interest_stable-id",
  } as HTMLAnchorElement;
  const outsidePlatform = {
    ...link,
    href: "https://jobs.example/job_detail/stable-id.html?ka=personal_interest_job_stable-id",
  } as HTMLAnchorElement;
  vi.stubGlobal("document", {
    body: { innerText: "累计投递简历数量0" },
    querySelectorAll: () => [unrelated, malformedMarker, outsidePlatform],
  });
  vi.stubGlobal("location", {
    href: "https://www.zhipin.com/web/geek/recommend?tab=4&sub=1&page=1&tag=4",
    origin: "https://www.zhipin.com",
  });

  const metadata = captureBossJobEngagementMetadata(pageCaptureLimits);

  expect(metadata.jobs).toEqual([]);
});

test("keeps semantic engagement jobs when optional company and salary fields are absent", () => {
  const container = {
    innerText: "已停止招聘的后端工程师[北京]",
    parentElement: null,
    querySelector: () => null,
    querySelectorAll: () => [] as HTMLAnchorElement[],
    textContent: "已停止招聘的后端工程师[北京]",
  } as unknown as Element;
  const link = {
    href: "https://www.zhipin.com/job_detail/closed-job.html?ka=personal_interest_job_closed-job",
    innerText: "已停止招聘的后端工程师[北京]",
    parentElement: container,
    querySelector: () => null,
    textContent: "已停止招聘的后端工程师[北京]",
  } as unknown as HTMLAnchorElement;
  vi.stubGlobal("document", {
    body: { innerText: "感兴趣1" },
    querySelectorAll: () => [link],
  });
  vi.stubGlobal("location", {
    href: "https://www.zhipin.com/web/geek/recommend?tab=4&sub=1&page=1&tag=4",
    origin: "https://www.zhipin.com",
  });

  const metadata = captureBossJobEngagementMetadata(pageCaptureLimits);

  expect(metadata.jobs).toEqual([
    expect.objectContaining({
      details: [],
      externalJobId: "closed-job",
      location: "北京",
      title: "已停止招聘的后端工程师",
    }),
  ]);
});
