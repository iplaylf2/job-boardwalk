import type { BrowserContext, Page } from "patchright";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { PassiveJobCollector, jobPostingObservations } from "#/browser/passive-job-collector.js";
import type { JobPostingWriter } from "#/workspace-service/job-posting-writer.js";
import type { SelectedJobSearchIntentReader } from "#/workspace-service/selected-job-search-intent-reader.js";

const onePageRead = 1;

function jobPage(url: string, title: string): Page {
  return {
    evaluate: () =>
      Promise.resolve({
        accessElements: [],
        accessText: "",
        cards: [
          {
            details: [],
            href: `https://www.zhipin.com/job_detail/${title}.html`,
            text: title,
            title,
          },
        ],
        title,
        truncated: false,
        url,
      }),
    url: () => url,
  } as unknown as Page;
}

function redirectingJobPage(destinationUrl: string): {
  moveTo: (url: string) => void;
  navigationCount: () => number;
  page: Page;
} {
  let url = "about:blank";
  let navigationCount = 0;
  const page = {
    evaluate: () =>
      Promise.resolve({
        accessElements: [],
        accessText: "",
        cards: [
          {
            details: [],
            href: "https://www.zhipin.com/job_detail/redirect-card.html",
            text: "重定向页面上的职位卡片",
            title: "后端开发",
          },
        ],
        title: "登录",
        truncated: false,
        url,
      }),
    goto: () => {
      navigationCount += onePageRead;
      url = destinationUrl;
      return Promise.resolve(null);
    },
    url: () => url,
  } as unknown as Page;
  return {
    moveTo(newUrl) {
      url = newUrl;
    },
    navigationCount: () => navigationCount,
    page,
  };
}

function selectedIntentReader(seedUrl: string): SelectedJobSearchIntentReader {
  return {
    *read() {
      yield* [];
      return {
        city: "北京",
        id: 1,
        name: "北京后端",
        position: "后端开发",
        recommendationPages: [{ label: "推荐", platformId: "boss", url: seedUrl }],
        selected: true,
        updatedAt: "2026-07-17T10:00:00.000Z",
      };
    },
  };
}

test("converts job-card evidence from any supported discovery page into posting observations", () => {
  expect(
    jobPostingObservations({
      capturedAt: "2026-07-17T10:00:00.000Z",
      cards: [
        {
          company: "星海科技",
          details: ["3-5年", "本科"],
          educationRequirement: "本科",
          experienceRequirement: "3-5年",
          href: "https://www.zhipin.com/job_detail/abc123.html",
          location: "北京",
          salary: "20-30K",
          text: "后端开发 星海科技 北京 20-30K 3-5年 本科",
          title: "后端开发",
        },
      ],
      platformId: "boss",
      sourceTitle: "Java 职位搜索",
      sourceUrl: "https://www.zhipin.com/web/geek/jobs?query=Java",
      truncated: false,
    }),
  ).toEqual([
    {
      collectedAt: "2026-07-17T10:00:00.000Z",
      company: "星海科技",
      details: ["3-5年", "本科"],
      discoveryUrl: "https://www.zhipin.com/web/geek/jobs?query=Java",
      educationRequirement: "本科",
      experienceRequirement: "3-5年",
      externalJobId: "abc123",
      jobUrl: "https://www.zhipin.com/job_detail/abc123.html",
      location: "北京",
      platformId: "boss",
      salaryText: "20-30K",
      summary: "后端开发 星海科技 北京 20-30K 3-5年 本科",
      title: "后端开发",
    },
  ]);
});

test("uses Yupao's numeric path segment as the stable external job id", () => {
  const observations = jobPostingObservations({
    capturedAt: "2026-07-17T10:00:00.000Z",
    cards: [
      ["123456789", "java-engineer"],
      ["987654321", "java-engineer"],
      ["123456789", "renamed-java-role"],
    ].map(([id, slug]) => ({
      details: [],
      href: `https://www.yupao.com/zhaogong/${id}/${slug}.html`,
      text: "Java开发工程师",
      title: "Java开发工程师",
    })),
    platformId: "yupao",
    sourceTitle: "Java 职位搜索",
    sourceUrl: "https://www.yupao.com/topic/java/",
    truncated: false,
  });

  expect(observations.map(({ externalJobId }) => externalJobId)).toEqual([
    "123456789",
    "987654321",
    "123456789",
  ]);
});

test("reuses a managed recommendation page after redirect without suppressing its cards", async () => {
  const seedUrl = "https://www.zhipin.com/web/geek/job-recommend";
  const loginUrl = "https://www.zhipin.com/web/user/";
  const pages: Page[] = [];
  let newPageCount = 0;
  const observations: { discoveryUrl: string }[] = [];
  const redirectedPage = redirectingJobPage(loginUrl);
  const context = {
    newPage: () => {
      newPageCount += onePageRead;
      pages.push(redirectedPage.page);
      return Promise.resolve(redirectedPage.page);
    },
    pages: () => [...pages],
  } as unknown as BrowserContext;
  const writer = {
    *write(observation) {
      yield* [];
      observations.push(observation);
    },
  } satisfies JobPostingWriter;
  const collector = new PassiveJobCollector(
    context,
    selectedIntentReader(seedUrl),
    writer,
    () => null,
  );
  await using scope = createScope();

  await scope.run(() => collector.collect((error) => expect.unreachable(error.message)));
  await scope.run(() => collector.collect((error) => expect.unreachable(error.message)));

  expect(redirectedPage.navigationCount()).toBe(onePageRead);
  expect(observations).toEqual([
    expect.objectContaining({ discoveryUrl: loginUrl }),
    expect.objectContaining({ discoveryUrl: loginUrl }),
  ]);

  const laterPageUrl = "https://www.zhipin.com/web/geek/jobs";
  redirectedPage.moveTo(laterPageUrl);
  await scope.run(() => collector.collect((error) => expect.unreachable(error.message)));

  expect(newPageCount).toBe(onePageRead);
  expect(redirectedPage.navigationCount()).toBe(onePageRead);
  expect(observations.at(-onePageRead)).toEqual(
    expect.objectContaining({ discoveryUrl: laterPageUrl }),
  );
});

test("collects recognizable cards from non-seed platform tabs during the selected intent", async () => {
  const seedUrl = "https://www.zhipin.com/web/geek/job-recommend";
  const searchUrl = "https://www.zhipin.com/web/geek/jobs?query=TypeScript";
  const context = {
    pages: () => [
      jobPage(seedUrl, "后端开发"),
      jobPage(searchUrl, "平台工程师"),
      { url: () => "https://example.invalid/jobs" } as Page,
    ],
  } as BrowserContext;
  const reader = selectedIntentReader(seedUrl);
  const observations: { discoveryUrl: string }[] = [];
  const writer = {
    *write(observation) {
      yield* [];
      observations.push(observation);
    },
  } satisfies JobPostingWriter;
  const collector = new PassiveJobCollector(context, reader, writer, () => null);
  await using scope = createScope();

  await scope.run(() => collector.collect((error) => expect.unreachable(error.message)));

  expect(observations).toEqual([
    expect.objectContaining({ discoveryUrl: seedUrl }),
    expect.objectContaining({ discoveryUrl: searchUrl }),
  ]);
});

test("continues collecting open platform tabs without seeding pages when no intent is selected", async () => {
  let pageReadCount = 0;
  let writeCount = 0;
  const context = {
    pages: () => {
      pageReadCount += onePageRead;
      return [jobPage("https://www.zhipin.com/web/geek/jobs", "后端开发")];
    },
  } as unknown as BrowserContext;
  const reader = {
    *read() {
      yield* [];
      return null;
    },
  } satisfies SelectedJobSearchIntentReader;
  const writer = {
    *write() {
      yield* [];
      writeCount += onePageRead;
    },
  } satisfies JobPostingWriter;
  const collector = new PassiveJobCollector(context, reader, writer, () => null);
  await using scope = createScope();

  await scope.run(() => collector.collect((error) => expect.unreachable(error.message)));

  expect(pageReadCount).toBe(onePageRead);
  expect(writeCount).toBe(onePageRead);
});

test("reports one unstable page and preserves jobs from later healthy pages", async () => {
  const seedUrl = "https://www.zhipin.com/web/geek/job-recommend";
  const pageError = new Error("页面在读取期间发生导航");
  const unstablePage = {
    evaluate: () => Promise.reject(pageError),
    url: () => "https://www.zhipin.com/web/geek/jobs?query=Java",
  } as unknown as Page;
  const context = {
    pages: () => [unstablePage, jobPage(seedUrl, "后端开发")],
  } as unknown as BrowserContext;
  const observations: { discoveryUrl: string }[] = [];
  const writer = {
    *write(observation) {
      yield* [];
      observations.push(observation);
    },
  } satisfies JobPostingWriter;
  const collector = new PassiveJobCollector(
    context,
    selectedIntentReader(seedUrl),
    writer,
    () => null,
  );
  const errors: Error[] = [];
  await using scope = createScope();

  await scope.run(() => collector.collect((error) => errors.push(error)));

  expect(errors).toHaveLength(onePageRead);
  expect(errors).toEqual([pageError]);
  expect(observations).toEqual([expect.objectContaining({ discoveryUrl: seedUrl })]);
});
