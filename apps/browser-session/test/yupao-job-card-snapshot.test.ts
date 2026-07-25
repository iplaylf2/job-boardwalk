import { afterEach, expect, test, vi } from "vitest";

import { captureJobCardMetadata } from "#/browser/job-observation/card-snapshot.js";
import { requireJobCardExtractionConfig } from "#/browser/recruiting-platform-adapters.js";

function textElement(textContent: string): Element {
  return { textContent } as Element;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("does not read Yupao salary text from a broad wrapper class", () => {
  const container = {
    querySelector: (selector: string) =>
      selector === "[class*='salary']" ? textElement("150009000-12000元/月") : null,
    querySelectorAll: () => [],
    textContent: "合成护工岗位15000 9000-12000元/月 经验不限 学历不限 示例家政甲",
  } as unknown as Element;
  const link = {
    closest: () => container,
    href: "https://www.yupao.com/zhaogong/123456789/example.html",
    textContent: "合成护工岗位15000",
  } as unknown as HTMLAnchorElement;
  vi.stubGlobal("document", {
    body: { innerText: "推荐职位" },
    querySelectorAll: () => [link],
    title: "北京招聘信息 - 鱼泡直聘",
  });
  vi.stubGlobal("location", {
    href: "https://www.yupao.com/topic/a2c1488/",
    origin: "https://www.yupao.com",
  });

  const metadata = captureJobCardMetadata({
    accessTextCharacters: 5000,
    config: requireJobCardExtractionConfig("https://www.yupao.com/topic/a2c1488/").config,
    maximumAccessElements: 300,
    maximumCardTextCharacters: 1500,
    maximumCards: 50,
    maximumFieldCharacters: 300,
  });

  expect(metadata.cards).toEqual([
    expect.objectContaining({
      salary: "9000-12000元/月",
      title: "合成护工岗位15000",
    }),
  ]);
});
