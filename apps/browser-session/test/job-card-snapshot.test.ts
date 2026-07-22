import { afterEach, expect, test, vi } from "vitest";
import { runInNewContext } from "node:vm";

import { captureJobCardMetadata } from "#/browser/job-card-snapshot.js";
import { requireJobCardExtraction } from "#/browser/recruiting-platform-adapters.js";

const singleCard = 1;

function textElement(textContent: string): Element {
  return { textContent } as Element;
}

function jobCardContainer(fields: Record<string, string>, details: string[]): Element {
  return {
    querySelector: (selector: string) =>
      selector in fields ? textElement(fields[selector] ?? "") : null,
    querySelectorAll: (selector: string) =>
      selector === ".tag-list li" ? details.map(textElement) : [],
    textContent: Object.values(fields).join(" "),
  } as unknown as Element;
}

function bossJobCardLinks(): HTMLAnchorElement[] {
  const firstContainer = jobCardContainer(
    {
      ".job-name": "后端工程师",
      ".salary": "-K",
      "[class*='location']": "上海",
      "a[href*='/gongsi/']": "示例科技甲",
    },
    ["3-5年", "本科"],
  );
  const secondContainer = jobCardContainer(
    {
      ".company-name": "示例网络乙",
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
    jobCardLink("https://www.zhipin.com/job_detail/first.html", "后端工程师", firstContainer),
    jobCardLink("https://www.zhipin.com/job_detail/first.html", "重复链接", firstContainer),
    jobCardLink(
      "https://www.zhipin.com/job_detail/first.html?securityId=rotating-token",
      "带临时参数的重复链接",
      firstContainer,
    ),
    jobCardLink("https://outside.example/job_detail/outside.html", "站外岗位", firstContainer),
    jobCardLink("https://www.zhipin.com/job_detail/second.html", "平台工程师", secondContainer),
  ];
}

function jobCardLink(href: string, title: string, container: Element): HTMLAnchorElement {
  return {
    closest: () => container,
    href,
    textContent: title,
  } as unknown as HTMLAnchorElement;
}

function yupaoJobCardLinks(): HTMLAnchorElement[] {
  const linkOnlyContainer = jobCardContainer({}, []);
  const jobContainer = jobCardContainer(
    {
      "a[href*='/qiye/']": "示例科技丙",
    },
    [],
  );
  const moreContainer = jobCardContainer({}, []);
  jobContainer.textContent =
    "Java开发工程师 4000-5000元/月 Java 3-5年 本科 示例科技丙 海淀区·示例园";
  moreContainer.textContent = "查看更多信息";
  return [
    {
      closest: () => linkOnlyContainer,
      href: "https://www.yupao.com/zhaogong/123456789/java-engineer.html",
      innerText: "Java开发工程师",
      parentElement: jobContainer,
      textContent: "Java开发工程师",
    } as unknown as HTMLAnchorElement,
    jobCardLink("https://www.yupao.com/zhaogong/987654321.html", "查看更多信息", moreContainer),
  ];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("does not promote a BOSS detail-panel link to a surrounding list container", () => {
  const surroundingList = jobCardContainer(
    {
      ".job-name": "被错误借用的标题",
      "a[href*='/gongsi/']": "被错误借用的公司",
    },
    [],
  );
  const detailLink = {
    closest: () => null,
    href: "https://www.zhipin.com/job_detail/detail-panel.html",
    parentElement: surroundingList,
    textContent: "查看更多信息",
  } as unknown as HTMLAnchorElement;
  vi.stubGlobal("document", {
    body: { innerText: "推荐职位" },
    querySelectorAll: () => [detailLink],
    title: "推荐职位 - BOSS直聘",
  });
  vi.stubGlobal("location", {
    href: "https://www.zhipin.com/web/geek/jobs",
    origin: "https://www.zhipin.com",
  });

  const metadata = captureJobCardMetadata({
    accessTextCharacters: 5000,
    config: requireJobCardExtraction("https://www.zhipin.com/web/geek/jobs").extraction,
    maximumAccessElements: 300,
    maximumCardTextCharacters: 1500,
    maximumCards: 50,
    maximumFieldCharacters: 300,
  });

  expect(metadata.cards).toEqual([]);
});

test("deduplicates BOSS job links by stable external id instead of the full URL", () => {
  const container = jobCardContainer(
    {
      ".job-name": "后端工程师",
      "a[href*='/gongsi/']": "示例科技甲",
    },
    [],
  );
  vi.stubGlobal("document", {
    body: { innerText: "推荐职位" },
    querySelectorAll: () => [
      jobCardLink("https://www.zhipin.com/job_detail/stable.html", "后端工程师", container),
      jobCardLink(
        "https://www.zhipin.com/job_detail/stable.html?securityId=rotating-token",
        "后端工程师",
        container,
      ),
    ],
    title: "推荐职位 - BOSS直聘",
  });
  vi.stubGlobal("location", {
    href: "https://www.zhipin.com/web/geek/jobs",
    origin: "https://www.zhipin.com",
  });

  const metadata = captureJobCardMetadata({
    accessTextCharacters: 5000,
    config: requireJobCardExtraction("https://www.zhipin.com/web/geek/jobs").extraction,
    maximumAccessElements: 300,
    maximumCardTextCharacters: 1500,
    maximumCards: 50,
    maximumFieldCharacters: 300,
  });

  expect(metadata.cards).toHaveLength(singleCard);
  expect(metadata.truncated).toBe(false);
});

test("extracts bounded, deduplicated evidence only from same-origin job cards", () => {
  vi.stubGlobal("document", {
    body: { innerText: "推荐职位" },
    querySelectorAll: () => bossJobCardLinks(),
    title: "推荐职位 - BOSS直聘",
  });
  vi.stubGlobal("location", {
    href: "https://www.zhipin.com/web/geek/job-recommend",
    origin: "https://www.zhipin.com",
  });

  const metadata = captureJobCardMetadata({
    accessTextCharacters: 5000,
    config: requireJobCardExtraction("https://www.zhipin.com/web/geek/job-recommend").extraction,
    maximumAccessElements: 300,
    maximumCardTextCharacters: 1500,
    maximumCards: 1,
    maximumFieldCharacters: 300,
  });

  expect(metadata).toMatchObject({
    cards: [
      {
        company: "示例科技甲",
        details: ["3-5年", "本科"],
        location: "上海",
        salary: "25-35K",
        title: "后端工程师",
      },
    ],
    truncated: true,
  });
});

test("executes the serialized page callback without Node-side helpers", () => {
  const input = {
    accessTextCharacters: 5000,
    config: requireJobCardExtraction("https://www.zhipin.com/web/geek/job-recommend").extraction,
    maximumAccessElements: 300,
    maximumCardTextCharacters: 1500,
    maximumCards: 50,
    maximumFieldCharacters: 300,
  };
  const result = runInNewContext(`(${captureJobCardMetadata.toString()})(input)`, {
    URL,
    document: {
      body: { innerText: "推荐职位" },
      querySelectorAll: () => [],
      title: "推荐职位 - BOSS直聘",
    },
    input,
    location: {
      href: "https://www.zhipin.com/web/geek/job-recommend",
      origin: "https://www.zhipin.com",
    },
  }) as { cards: unknown[]; title: string; url: string };

  expect(result).toMatchObject({
    cards: [],
    title: "推荐职位 - BOSS直聘",
    url: "https://www.zhipin.com/web/geek/job-recommend",
  });
});

test("excludes Yupao's more-information entry from job evidence", () => {
  vi.stubGlobal("document", {
    body: { innerText: "消息\n简历\n测试用户\n推荐" },
    querySelectorAll: () => yupaoJobCardLinks(),
    title: "北京招聘信息 - 鱼泡直聘",
  });
  vi.stubGlobal("location", {
    href: "https://www.yupao.com/topic/a2c1488/",
    origin: "https://www.yupao.com",
  });

  const metadata = captureJobCardMetadata({
    accessTextCharacters: 5000,
    config: requireJobCardExtraction("https://www.yupao.com/topic/a2c1488/").extraction,
    maximumAccessElements: 300,
    maximumCardTextCharacters: 1500,
    maximumCards: 50,
    maximumFieldCharacters: 300,
  });

  expect(metadata.cards).toMatchObject([
    {
      company: "示例科技丙",
      educationRequirement: "本科",
      experienceRequirement: "3-5年",
      location: "海淀区·示例园",
      salary: "4000-5000元/月",
      title: "Java开发工程师",
    },
  ]);
  expect(metadata.accessText).toBe("消息\n简历\n测试用户\n推荐");
  expect(metadata.truncated).toBe(false);
});
