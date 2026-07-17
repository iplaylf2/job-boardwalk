import { afterEach, expect, test, vi } from "vitest";

import { captureRecommendationMetadata } from "#/browser/recommendation-page.js";
import { requireRecommendationPage } from "#/browser/recruiting-platform-adapters.js";

function textElement(textContent: string): Element {
  return { textContent } as Element;
}

function recommendationContainer(fields: Record<string, string>, details: string[]): Element {
  return {
    querySelector: (selector: string) =>
      selector in fields ? textElement(fields[selector] ?? "") : null,
    querySelectorAll: (selector: string) =>
      selector === ".tag-list li" ? details.map(textElement) : [],
    textContent: Object.values(fields).join(" "),
  } as unknown as Element;
}

function bossRecommendationLinks(): HTMLAnchorElement[] {
  const firstContainer = recommendationContainer(
    {
      ".company-name": "星海科技",
      ".job-area": "上海",
      ".job-name": "后端工程师",
      ".salary": "-K",
    },
    ["3-5年", "本科"],
  );
  const secondContainer = recommendationContainer(
    {
      ".company-name": "远帆网络",
      ".job-area": "杭州",
      ".job-name": "平台工程师",
      ".salary": "20-30K",
    },
    ["经验不限"],
  );
  return [
    {
      closest: () => null,
      href: "https://www.zhipin.com/job_detail/first.html",
      textContent: "不完整的重复链接",
    } as unknown as HTMLAnchorElement,
    recommendationLink(
      "https://www.zhipin.com/job_detail/first.html",
      "后端工程师",
      firstContainer,
    ),
    recommendationLink("https://www.zhipin.com/job_detail/first.html", "重复链接", firstContainer),
    recommendationLink(
      "https://outside.example/job_detail/outside.html",
      "站外岗位",
      firstContainer,
    ),
    recommendationLink(
      "https://www.zhipin.com/job_detail/second.html",
      "平台工程师",
      secondContainer,
    ),
  ];
}

function recommendationLink(href: string, title: string, container: Element): HTMLAnchorElement {
  return {
    closest: () => container,
    href,
    textContent: title,
  } as unknown as HTMLAnchorElement;
}

function yupaoRecommendationLinks(): HTMLAnchorElement[] {
  const jobContainer = recommendationContainer({}, []);
  const moreContainer = recommendationContainer({}, []);
  jobContainer.textContent = "Java开发工程师 1.5-2万元/月 Java 3-5年 本科";
  moreContainer.textContent = "查看更多信息";
  return [
    recommendationLink(
      "https://www.yupao.com/zhaogong/123456789.html",
      "Java开发工程师",
      jobContainer,
    ),
    recommendationLink(
      "https://www.yupao.com/zhaogong/987654321.html",
      "查看更多信息",
      moreContainer,
    ),
  ];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test.each([
  ["https://www.zhipin.com/web/geek/job-recommend", "boss", "job-search-intent-recommendations"],
  ["https://www.zhipin.com/web/geek/jobs", "boss", "job-search-intent-recommendations"],
  ["https://www.yupao.com/topic/a2c1488/", "yupao", "job-search-intent-recommendations"],
])("recognizes the supported recommendation surface at %s", (url, platformId, pageKind) => {
  expect(requireRecommendationPage(url)).toMatchObject({ pageKind, platformId });
});

test.each([
  "https://www.zhipin.com/web/geek/jobs?query=Java",
  "https://www.zhipin.com/job_detail/example.html",
  "https://www.yupao.com/a2/",
  "https://www.yupao.com/zhaogong/a1c0/",
  "https://www.yupao.com/job/123.html",
])("rejects non-recommendation pages at %s", (url) => {
  expect(() => requireRecommendationPage(url)).toThrow(/不是.*推荐职位页面/u);
});

test("extracts bounded, deduplicated evidence only from same-origin job cards", () => {
  vi.stubGlobal("document", {
    body: { innerText: "推荐职位" },
    querySelectorAll: () => bossRecommendationLinks(),
    title: "推荐职位 - BOSS直聘",
  });
  vi.stubGlobal("location", {
    href: "https://www.zhipin.com/web/geek/job-recommend",
    origin: "https://www.zhipin.com",
  });

  const metadata = captureRecommendationMetadata({
    accessTextCharacters: 5000,
    config: requireRecommendationPage("https://www.zhipin.com/web/geek/job-recommend").extraction,
    maximumAccessElements: 300,
    maximumFieldCharacters: 300,
    maximumItemTextCharacters: 1500,
    maximumItems: 1,
  });

  expect(metadata).toMatchObject({
    items: [
      {
        company: "星海科技",
        details: ["3-5年", "本科"],
        location: "上海",
        salary: "25-35K",
        title: "后端工程师",
      },
    ],
    truncated: true,
  });
});

test("excludes Yupao's more-information entry from job evidence", () => {
  vi.stubGlobal("document", {
    body: { innerText: "消息\n简历\n测试用户\n推荐" },
    querySelectorAll: () => yupaoRecommendationLinks(),
    title: "北京招聘信息 - 鱼泡直聘",
  });
  vi.stubGlobal("location", {
    href: "https://www.yupao.com/topic/a2c1488/",
    origin: "https://www.yupao.com",
  });

  const metadata = captureRecommendationMetadata({
    accessTextCharacters: 5000,
    config: requireRecommendationPage("https://www.yupao.com/topic/a2c1488/").extraction,
    maximumAccessElements: 300,
    maximumFieldCharacters: 300,
    maximumItemTextCharacters: 1500,
    maximumItems: 50,
  });

  expect(metadata.items).toMatchObject([
    {
      educationRequirement: "本科",
      experienceRequirement: "3-5年",
      salary: "1.5-2万元/月",
      title: "Java开发工程师",
    },
  ]);
  expect(metadata.accessText).toBe("消息\n简历\n测试用户\n推荐");
  expect(metadata.truncated).toBe(false);
});
