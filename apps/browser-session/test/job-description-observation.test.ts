import { afterEach, expect, test, vi } from "vitest";
import { runInNewContext } from "node:vm";

import { captureJobDescriptionMetadata } from "#/browser/job-observation/description-observation.js";
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
    ".salary": { textContent: "20-30K" },
  };
  vi.stubGlobal("document", {
    body: { innerText: "职位描述\n正文\n合成招聘者\nBOSS 安全提示\n推荐岗位" },
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
    description: "岗位职责\n维护合成业务系统。\n任职要求\n具备沟通能力。",
    title: "业务系统工程师",
    truncated: false,
    url,
  });
});
