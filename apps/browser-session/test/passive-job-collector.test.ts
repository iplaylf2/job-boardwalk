import { expect, test } from "vitest";

import {
  jobPostingObservations,
  recommendationPagesWithoutOpenTab,
} from "#/browser/passive-job-collector.js";

test("converts only recommendation-page evidence into posting observations", () => {
  expect(
    jobPostingObservations({
      capturedAt: "2026-07-17T10:00:00.000Z",
      items: [
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
      pageKind: "job-search-intent-recommendations",
      platformId: "boss",
      sourceTitle: "职位推荐",
      sourceUrl: "https://www.zhipin.com/web/geek/jobs",
      truncated: false,
    }),
  ).toEqual([
    {
      collectedAt: "2026-07-17T10:00:00.000Z",
      company: "星海科技",
      details: ["3-5年", "本科"],
      discoveryUrl: "https://www.zhipin.com/web/geek/jobs",
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
