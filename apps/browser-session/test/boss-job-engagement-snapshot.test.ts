import { afterEach, expect, test, vi } from "vitest";

import { captureBossJobEngagementMetadata } from "#/browser/job-engagement/boss-snapshot.js";

function textElement(textContent: string): Element {
  return { textContent } as Element;
}

function personalJobCard(): { container: Element; link: HTMLAnchorElement } {
  const company = textElement("畅捷通");
  const links: HTMLAnchorElement[] = [];
  const container = {
    innerText:
      "付女士 HRBP\n畅捷通\n互联网 已上市 1000-9999人\n.net全栈开发工程师\n[北京·海淀区·西北旺]\n25-30K·14薪 3-5年 本科",
    parentElement: null,
    querySelector: (selector: string) => (selector === "a[href*='/gongsi/']" ? company : null),
    querySelectorAll: () => links,
    textContent:
      "付女士 HRBP 畅捷通 互联网 已上市 1000-9999人 .net全栈开发工程师 [北京·海淀区·西北旺] 25-30K·14薪 3-5年 本科",
  } as unknown as Element;
  const link = {
    href: "https://www.zhipin.com/job_detail/stable-id.html?securityId=rotating&ka=personal_submitted_job_stable-id",
    innerText: ".net全栈开发工程师[北京·海淀区·西北旺]",
    parentElement: container,
    textContent: ".net全栈开发工程师[北京·海淀区·西北旺]",
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

  const metadata = captureBossJobEngagementMetadata();

  expect(metadata.jobs).toEqual([
    expect.objectContaining({
      company: "畅捷通",
      educationRequirement: "本科",
      experienceRequirement: "3-5年",
      externalJobId: "stable-id",
      location: "北京·海淀区·西北旺",
      salaryText: "25-30K·14薪",
      title: ".net全栈开发工程师",
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

  const metadata = captureBossJobEngagementMetadata();

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

  const metadata = captureBossJobEngagementMetadata();

  expect(metadata.jobs).toEqual([
    expect.objectContaining({
      details: [],
      externalJobId: "closed-job",
      location: "北京",
      title: "已停止招聘的后端工程师",
    }),
  ]);
});
