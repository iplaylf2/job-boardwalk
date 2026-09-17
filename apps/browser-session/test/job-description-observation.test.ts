import { afterEach, expect, test, vi } from "vitest";
import { runInNewContext } from "node:vm";

import { captureJobDescriptionMetadata } from "#/browser/job-observation/description-page-capture.js";
import { requireJobDetailExtractionConfigs } from "#/browser/recruiting-platform-adapters.js";

function inputFor(url: string) {
  const { cardConfig, descriptionConfig } = requireJobDetailExtractionConfigs(url);
  return {
    accessTextCharacters: 5000,
    cardConfig,
    descriptionConfig,
    maximumAccessElements: 300,
    maximumDescriptionCharacters: 20_000,
    maximumFieldCharacters: 300,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("observes the BOSS main description without surrounding recruiter or recommendation text", () => {
  const url = "https://www.zhipin.com/job_detail/synthetic-role.html";
  const companySelector = "a[href*='/gongsi/'][href*='.html']:not([href*='/gongsi/job/'])";
  const fields: Record<string, { innerText?: string; textContent: string }> = {
    ".job-name": { textContent: "平台工程师" },
    ".job-sec-text": {
      innerText: "工作职责\n1. 建设合成测试平台。\n任职资格\n1. 熟悉 TypeScript。",
      textContent: "工作职责 1. 建设合成测试平台。任职资格 1. 熟悉 TypeScript。",
    },
    ".salary": { textContent: "-K" },
  };
  vi.stubGlobal("document", {
    body: { innerText: "职位描述\n-年\n正文\n合成招聘者\nBOSS 安全提示\n推荐岗位" },
    querySelector: (selector: string) => fields[selector] ?? null,
    querySelectorAll(selector: string) {
      if (selector === companySelector) {
        return [{ textContent: "" }, { textContent: "合成雇主甲" }];
      }
      return fields[selector] ? [fields[selector]] : [];
    },
  });
  vi.stubGlobal("location", { href: url });

  const metadata = captureJobDescriptionMetadata(inputFor(url));

  expect(metadata).toMatchObject({
    company: "合成雇主甲",
    description: "工作职责\n1. 建设合成测试平台。\n任职资格\n1. 熟悉 TypeScript。",
    experienceRequirement: "3-5年",
    salaryText: "20-30K",
    title: "平台工程师",
    truncated: false,
    url,
  });
});

test("extracts the Yupao description from its visible section boundary", () => {
  const url = "https://www.yupao.com/zhaogong/123456789/synthetic-role.html";
  const input = inputFor(url);
  const result = runInNewContext(`(${captureJobDescriptionMetadata.toString()})(input)`, {
    Number,
    document: {
      body: {
        innerText:
          "职位详情\n职位说明：\n岗位职责\n维护合成业务系统。\n任职要求\n具备沟通能力。\n职位总结\n相关推荐",
      },
      querySelector(selector: string) {
        return selector === "h1" ? { textContent: "业务系统工程师" } : null;
      },
      querySelectorAll(selector: string) {
        return selector === "h1" ? [{ textContent: "业务系统工程师" }] : [];
      },
    },
    input,
    location: { href: url },
  }) as ReturnType<typeof captureJobDescriptionMetadata>;

  expect(result).toMatchObject({
    description: "职位说明：\n岗位职责\n维护合成业务系统。\n任职要求\n具备沟通能力。",
    title: "业务系统工程师",
    truncated: false,
    url,
  });
});

test("extracts a Yupao detail page whose visible body starts the description at job duties", () => {
  const url = "https://www.yupao.com/zhaogong/987654321/synthetic-platform-role.html";
  const input = inputFor(url);
  const result = runInNewContext(`(${captureJobDescriptionMetadata.toString()})(input)`, {
    Number,
    document: {
      body: {
        innerText:
          "职位详情\n3-5年\n本科\n合成平台工程师\n岗位职责：\n1、建设合成任务平台。\n任职要求：\n1、熟悉 TypeScript。\n职位总结\n相关推荐",
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    },
    input,
    location: { href: url },
  }) as ReturnType<typeof captureJobDescriptionMetadata>;

  expect(result).toMatchObject({
    description:
      "3-5年\n本科\n合成平台工程师\n岗位职责：\n1、建设合成任务平台。\n任职要求：\n1、熟悉 TypeScript。",
    title: "合成平台工程师",
    truncated: false,
    url,
  });
});

test.each(["职位描述：", "岗位要求："])(
  "extracts Yupao's salary header and %s section",
  (heading) => {
    const url = "https://www.yupao.com/zhaogong/100000001.html";
    const input = inputFor(url);
    const result = runInNewContext(`(${captureJobDescriptionMetadata.toString()})(input)`, {
      document: {
        body: {
          innerText: `合成测试导航
合成系统工程师
1.2-1.8万元/月
职位详情
3-5年 本科
${heading}
维护合成任务系统。
岗位要求：
任职要求：
熟悉合成测试流程。
职位总结
推荐岗位
其他工程师
2-3万元/月`,
        },
        querySelector: () => null,
        querySelectorAll: () => [],
      },
      input,
      location: { href: url },
    }) as ReturnType<typeof captureJobDescriptionMetadata>;
    expect(result.title).toBe("合成系统工程师");
    expect(result.description).toBe(
      `3-5年 本科\n${heading}\n维护合成任务系统。\n岗位要求：\n任职要求：\n熟悉合成测试流程。`,
    );
  },
);

test.each(["1.4–2.2万/月", "18–28K/月"])(
  "keeps Yupao's main salary %s, preceding requirements, and actual work address together",
  (salary) => {
    const url = "https://www.yupao.com/zhaogong/900000011.html";
    const body = {
      innerText: `合成工具工程师\n${salary}\n免费聊\n职位详情\n核心技能\n熟悉 Rust 与合成队列。\n岗位职责：\n维护合成编译服务。\n工作地址\n合成市示例区测试路\n职位总结\n相关推荐\n合成兼职岗位\n600-700元/天\n工作地址\n另一合成城市`,
    };
    vi.stubGlobal("document", {
      body,
      querySelector: () => null,
      querySelectorAll: (selector: string) => {
        if (selector === "body") {
          return [body];
        }
        if (selector === ".salary") {
          return [{ textContent: "600-700元/天" }];
        }
        if (selector === ".job-name") {
          return [{ textContent: "合成兼职岗位" }];
        }
        return [];
      },
    });
    vi.stubGlobal("location", { href: url });
    expect(captureJobDescriptionMetadata(inputFor(url))).toMatchObject({
      description: "核心技能\n熟悉 Rust 与合成队列。\n岗位职责：\n维护合成编译服务。",
      location: "合成市示例区测试路",
      salaryText: salary,
      title: "合成工具工程师",
      truncated: false,
    });
  },
);

test("does not fill absent Yupao main facts from recommended jobs", () => {
  const url = "https://www.yupao.com/zhaogong/900000012.html";
  const body = {
    innerText:
      "合成岗位\n职位详情\n维护合成系统。\n职位总结\n相关推荐\n另一合成岗位\n600-700元/天\n工作地址\n合成推荐地址",
  };
  vi.stubGlobal("document", {
    body,
    querySelector: () => null,
    querySelectorAll: (selector: string) => (selector === "body" ? [body] : []),
  });
  vi.stubGlobal("location", { href: url });
  expect(captureJobDescriptionMetadata(inputFor(url))).toMatchObject({
    description: "维护合成系统。",
    location: null,
    salaryText: null,
  });
});

test.each([
  { evidence: "职位已关闭", text: "职位已关闭\n职位描述\n维护合成服务。" },
  { evidence: null, text: "职位描述\n维护合成服务。\n相关推荐\n职位已关闭" },
  { evidence: null, text: "职位描述\n文档示例包含职位已关闭字样。" },
  { evidence: null, text: "职位描述\n维护合成服务。" },
  { evidence: null, text: "合成页面\n相关推荐\n职位已关闭" },
])("classifies BOSS recruitment independently of retained body: $text", ({ text, evidence }) => {
  const url = "https://www.zhipin.com/job_detail/synthetic-closed-role.html";
  const result = runInNewContext(`(${captureJobDescriptionMetadata.toString()})(input)`, {
    document: {
      body: { innerText: text },
      querySelector: (selector: string) =>
        selector === ".job-sec-text" ? { innerText: "维护合成服务。" } : null,
      querySelectorAll: (selector: string) =>
        selector === ".job-name" ? [{ textContent: "合成工程师" }] : [],
    },
    input: inputFor(url),
    location: { href: url },
  }) as ReturnType<typeof captureJobDescriptionMetadata>;
  expect(result.description).toBe("维护合成服务。");
  expect(result.recruitmentClosure).toBe(evidence);
});
