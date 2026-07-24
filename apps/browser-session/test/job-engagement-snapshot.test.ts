import type { Page } from "patchright";
import { runInNewContext } from "node:vm";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import {
  captureJobEngagementSnapshot,
  jobEngagementSnapshotFromPageMetadata,
  parseJobEngagementTotal,
} from "#/browser/job-engagement/snapshot.js";
import { maximumJobsPerEngagementScan } from "#/browser/job-engagement/scan-limit.js";
import { captureYupaoJobEngagementMetadata } from "#/browser/job-engagement/yupao-page-capture.js";

const appliedJobCount = 3;
const contactedJobCount = 12;
const interestedJobCount = 2;
const interviewedJobCount = 0;
const maximumSummaryCharacters = 1500;
const pageCaptureLimits = {
  maximumCards: maximumJobsPerEngagementScan,
  maximumSummaryCharacters,
};

test("keeps the serialized Yupao extractor self-contained", () => {
  const result = runInNewContext(
    `(${captureYupaoJobEngagementMetadata.toString()})(${JSON.stringify(pageCaptureLimits)})`,
    {
      document: {
        body: { innerText: "感兴趣0" },
        querySelectorAll: () => [],
      },
      location: {
        href: "https://www.yupao.com/user/resume-info/?tab=4&subTab=1&mode=1",
      },
    },
  ) as { cards: unknown[]; text: string; url: string };

  expect(result).toEqual({
    cards: [],
    text: "感兴趣0",
    truncated: false,
    url: "https://www.yupao.com/user/resume-info/?tab=4&subTab=1&mode=1",
  });
});

test("classifies a complete Yupao interest page without requiring job links", () => {
  expect(
    jobEngagementSnapshotFromPageMetadata(
      {
        jobs: [
          {
            company: "示例科技甲",
            details: ["AIGC"],
            location: "朝阳区",
            salaryText: "2-4万元/月",
            summary: "AIGC应用开发 朝阳区",
            title: "AIGC应用开发",
          },
        ],
        text: "面试0\n感兴趣1\n收藏职位",
        truncated: false,
        url: "https://www.yupao.com/user/resume-info/?tab=4&subTab=1&mode=1",
      },
      "2026-07-19T10:00:00.000Z",
      "interested",
      "yupao",
    ),
  ).toEqual({
    capturedAt: "2026-07-19T10:00:00.000Z",
    complete: true,
    completionTotal: 1,
    engagement: "interested",
    jobs: [
      {
        company: "示例科技甲",
        details: ["AIGC"],
        location: "朝阳区",
        salaryText: "2-4万元/月",
        summary: "AIGC应用开发 朝阳区",
        title: "AIGC应用开发",
      },
    ],
    platformId: "yupao",
    sourceUrl: "https://www.yupao.com/user/resume-info/?tab=4&subTab=1&mode=1",
    total: 1,
  });
});

test("uses Yupao's numeric path segment for linked interest jobs", () => {
  const snapshot = jobEngagementSnapshotFromPageMetadata(
    {
      jobs: [
        {
          details: [],
          jobUrl: "https://www.yupao.com/zhaogong/123456789/java-engineer.html",
          summary: "Java开发工程师",
          title: "Java开发工程师",
        },
      ],
      text: "感兴趣1",
      truncated: false,
      url: "https://www.yupao.com/user/resume-info/?tab=4&subTab=1&mode=1",
    },
    "2026-07-19T10:00:00.000Z",
    "interested",
    "yupao",
  );

  expect(snapshot.jobs).toEqual([expect.objectContaining({ externalJobId: "123456789" })]);
});

test("keeps a Yupao snapshot partial when the visible total is unavailable", () => {
  const snapshot = jobEngagementSnapshotFromPageMetadata(
    {
      jobs: [
        {
          company: "示例科技甲",
          details: [],
          location: "朝阳区",
          summary: "AIGC应用开发 朝阳区",
          title: "AIGC应用开发",
        },
      ],
      text: "我的求职进展",
      truncated: false,
      url: "https://www.yupao.com/user/resume-info/?tab=4&subTab=1&mode=1",
    },
    "2026-07-19T10:00:00.000Z",
    "interested",
    "yupao",
  );

  expect(snapshot).toMatchObject({ complete: false, completionTotal: null, total: 1 });
});

test("reports Yupao page access from a stable interest snapshot", async () => {
  const url = "https://www.yupao.com/user/resume-info/?tab=4&subTab=1&mode=1";
  const page = {
    evaluate: () =>
      Promise.resolve({
        cards: [],
        text: "首页\n消息\n简历\n鱼泡用户\n推荐\n感兴趣0",
        url,
      }),
    url: () => url,
  } as unknown as Page;
  const observedPages: unknown[] = [];
  await using scope = createScope();

  await scope.run(() =>
    captureJobEngagementSnapshot(page, (facts) => {
      observedPages.push(facts);
    }),
  );

  expect(observedPages).toEqual([
    {
      elements: [],
      text: "首页\n消息\n简历\n鱼泡用户\n推荐\n感兴趣0",
      url,
    },
  ]);
});

test("cleans BOSS interest-card titles and preserves the original detail link", async () => {
  const url = "https://www.zhipin.com/web/geek/recommend?tab=4&sub=1&page=1&tag=4";
  const page = {
    evaluate: () =>
      Promise.resolve({
        jobs: [
          {
            company: "示例科技丁",
            details: ["Node.js"],
            externalJobId: "agent-123",
            jobUrl: "https://www.zhipin.com/job_detail/agent-123.html?ka=personal_interest",
            location: "北京",
            salaryText: "30-40K·15薪",
            summary: "高级全栈工程师（Agent智能体） 北京",
            title: "高级全栈工程师（Agent智能体）",
          },
        ],
        text: "感兴趣 1",
        truncated: false,
        url,
      }),
    url: () => url,
  } as unknown as Page;
  await using scope = createScope();

  const snapshot = await scope.run(() => captureJobEngagementSnapshot(page));

  expect(snapshot).toMatchObject({
    complete: true,
    completionTotal: 1,
    engagement: "interested",
    jobs: [
      {
        externalJobId: "agent-123",
        location: "北京",
        title: "高级全栈工程师（Agent智能体）",
      },
    ],
    platformId: "boss",
    total: 1,
  });
});

test("keeps a BOSS snapshot partial when the visible total is unavailable", async () => {
  const url = "https://www.zhipin.com/web/geek/recommend?tab=4&sub=1&page=1&tag=4";
  const page = {
    evaluate: () =>
      Promise.resolve({
        jobs: [
          {
            details: [],
            externalJobId: "agent-123",
            jobUrl: "https://www.zhipin.com/job_detail/agent-123.html",
            summary: "后端开发",
            title: "后端开发",
          },
        ],
        text: "我的求职进展",
        truncated: false,
        url,
      }),
    url: () => url,
  } as unknown as Page;
  await using scope = createScope();

  const snapshot = await scope.run(() => captureJobEngagementSnapshot(page));

  expect(snapshot).toMatchObject({ complete: false, completionTotal: null, total: 1 });
});

test("keeps an empty later page partial when the declared total is nonzero", async () => {
  const url = "https://www.zhipin.com/web/geek/recommend?tab=1&sub=1&page=3&tag=4";
  const page = {
    evaluate: () =>
      Promise.resolve({
        jobs: [],
        text: "累计沟通职位数量18",
        truncated: false,
        url,
      }),
    url: () => url,
  } as unknown as Page;
  await using scope = createScope();

  const snapshot = await scope.run(() => captureJobEngagementSnapshot(page));

  expect(snapshot).toMatchObject({ complete: false, jobs: [], total: 18 });
});

test("reads the platform-maintained total for every job engagement", () => {
  const text = "沟通过\n已投递简历\n面试0\n感兴趣2\n累计沟通职位数量12\n累计投递简历数量3";

  expect(parseJobEngagementTotal(text, "contacted")).toBe(contactedJobCount);
  expect(parseJobEngagementTotal(text, "applied")).toBe(appliedJobCount);
  expect(parseJobEngagementTotal(text, "interviewed")).toBe(interviewedJobCount);
  expect(parseJobEngagementTotal(text, "interested")).toBe(interestedJobCount);
});
