import type { Page } from "patchright";
import { runInNewContext } from "node:vm";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import {
  captureJobInterestSnapshot,
  captureYupaoJobInterestMetadata,
  jobInterestSnapshotFromYupaoMetadata,
} from "#/browser/job-interest-snapshot.js";

const firstEvaluation = 1;

test("keeps the serialized Yupao extractor self-contained", () => {
  const result = runInNewContext(`(${captureYupaoJobInterestMetadata.toString()})()`, {
    document: {
      body: { innerText: "感兴趣0" },
      querySelectorAll: () => [],
    },
    location: {
      href: "https://www.yupao.com/user/resume-info/?tab=4&subTab=1&mode=1",
    },
  }) as { cards: unknown[]; text: string; url: string };

  expect(result).toEqual({
    cards: [],
    text: "感兴趣0",
    url: "https://www.yupao.com/user/resume-info/?tab=4&subTab=1&mode=1",
  });
});

test("classifies a complete Yupao interest page without requiring job links", () => {
  expect(
    jobInterestSnapshotFromYupaoMetadata(
      {
        cards: [
          {
            company: "星海科技",
            details: ["AIGC"],
            location: "朝阳区",
            salaryText: "2-4万元/月",
            summary: "AIGC应用开发 朝阳区",
            title: "AIGC应用开发",
          },
        ],
        text: "面试0\n感兴趣1\n收藏职位",
        url: "https://www.yupao.com/user/resume-info/?tab=4&subTab=1&mode=1",
      },
      "2026-07-19T10:00:00.000Z",
    ),
  ).toEqual({
    capturedAt: "2026-07-19T10:00:00.000Z",
    complete: true,
    jobs: [
      {
        company: "星海科技",
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
  const snapshot = jobInterestSnapshotFromYupaoMetadata(
    {
      cards: [
        {
          details: [],
          jobUrl: "https://www.yupao.com/zhaogong/123456789/java-engineer.html",
          summary: "Java开发工程师",
          title: "Java开发工程师",
        },
      ],
      text: "感兴趣1",
      url: "https://www.yupao.com/user/resume-info/?tab=4&subTab=1&mode=1",
    },
    "2026-07-19T10:00:00.000Z",
  );

  expect(snapshot.jobs).toEqual([expect.objectContaining({ externalJobId: "123456789" })]);
});

test("keeps a Yupao snapshot partial when the visible total is unavailable", () => {
  const snapshot = jobInterestSnapshotFromYupaoMetadata(
    {
      cards: [
        {
          company: "星海科技",
          details: [],
          location: "朝阳区",
          summary: "AIGC应用开发 朝阳区",
          title: "AIGC应用开发",
        },
      ],
      text: "我的求职进展",
      url: "https://www.yupao.com/user/resume-info/?tab=4&subTab=1&mode=1",
    },
    "2026-07-19T10:00:00.000Z",
  );

  expect(snapshot).toMatchObject({ complete: false, total: 1 });
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
    captureJobInterestSnapshot(page, (facts) => {
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
  let evaluation = 0;
  const page = {
    evaluate: () => {
      evaluation += firstEvaluation;
      return evaluation === firstEvaluation
        ? Promise.resolve({
            accessElements: [],
            accessText: "",
            cards: [
              {
                company: "360集团",
                details: ["Node.js"],
                href: "https://www.zhipin.com/job_detail/agent-123.html?ka=personal_interest",
                location: "[北京]",
                salary: "30-40K·15薪",
                text: "高级全栈工程师（Agent智能体） 北京",
                title: "高级全栈工程师（Agent智能体）[北京]",
              },
            ],
            title: "BOSS直聘",
            truncated: false,
            url: "https://www.zhipin.com/web/geek/recommend?tab=4&sub=1&page=1&tag=4",
          })
        : Promise.resolve("感兴趣 1");
    },
    title: () => Promise.resolve("BOSS直聘"),
    url: () => "https://www.zhipin.com/web/geek/recommend?tab=4&sub=1&page=1&tag=4",
  } as unknown as Page;
  await using scope = createScope();

  const snapshot = await scope.run(() => captureJobInterestSnapshot(page));

  expect(snapshot).toMatchObject({
    complete: true,
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
  let evaluation = 0;
  const page = {
    evaluate: () => {
      evaluation += firstEvaluation;
      return evaluation === firstEvaluation
        ? Promise.resolve({
            accessElements: [],
            accessText: "",
            cards: [
              {
                details: [],
                href: "https://www.zhipin.com/job_detail/agent-123.html",
                text: "后端开发",
                title: "后端开发",
              },
            ],
            title: "BOSS直聘",
            truncated: false,
            url: "https://www.zhipin.com/web/geek/recommend?tab=4&sub=1&page=1&tag=4",
          })
        : Promise.resolve("我的求职进展");
    },
    title: () => Promise.resolve("BOSS直聘"),
    url: () => "https://www.zhipin.com/web/geek/recommend?tab=4&sub=1&page=1&tag=4",
  } as unknown as Page;
  await using scope = createScope();

  const snapshot = await scope.run(() => captureJobInterestSnapshot(page));

  expect(snapshot).toMatchObject({ complete: false, total: 1 });
});
