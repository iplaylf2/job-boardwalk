import type { BrowserContext, Page } from "patchright";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import {
  PassiveJobCollector,
  jobPostingObservations,
  recommendationPagesWithoutOpenTab,
} from "#/browser/passive-job-collector.js";
import type { JobPostingWriter } from "#/workspace-service/job-posting-writer.js";
import type { SelectedJobSearchIntentReader } from "#/workspace-service/selected-job-search-intent-reader.js";

const noPageReads = 0;
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

test("opens each selected recommendation page that is not already present", () => {
  expect(
    recommendationPagesWithoutOpenTab(
      [
        {
          label: "Node.js(北京)",
          platformId: "boss",
          url: "https://www.zhipin.com/web/geek/jobs",
        },
        {
          label: "北京后端开发",
          platformId: "yupao",
          url: "https://www.yupao.com/topic/a2c1488/",
        },
      ],
      ["about:blank", "https://www.zhipin.com/job_detail/abc123.html"],
    ),
  ).toEqual([
    {
      label: "Node.js(北京)",
      platformId: "boss",
      url: "https://www.zhipin.com/web/geek/jobs",
    },
    {
      label: "北京后端开发",
      platformId: "yupao",
      url: "https://www.yupao.com/topic/a2c1488/",
    },
  ]);
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

test("does not inspect platform tabs without a selected intent", async () => {
  let pageReadCount = 0;
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
      expect.unreachable("没有选中的求职方向时不应写入岗位");
    },
  } satisfies JobPostingWriter;
  const collector = new PassiveJobCollector(context, reader, writer, () => null);
  await using scope = createScope();

  await scope.run(() => collector.collect((error) => expect.unreachable(error.message)));

  expect(pageReadCount).toBe(noPageReads);
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
