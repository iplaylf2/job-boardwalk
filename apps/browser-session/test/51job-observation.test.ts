import { afterEach, expect, test, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { JobCardSnapshot } from "@job-boardwalk/contracts";
import { parsePlatformWebUrl, resolvePlatformWebUrl } from "@job-boardwalk/platform-catalog";

import { captureJobCardMetadata } from "#/browser/job-observation/card-snapshot.js";
import { captureJobDescriptionMetadata } from "#/browser/job-observation/description-observation.js";
import { observationsFromJobCardSnapshot } from "#/browser/job-observation/passive-collector.js";
import { extractExternalJobId } from "#/browser/platform-job-links.js";
import {
  recruitingPlatformAdapters,
  requireJobCardExtractionConfig,
  requireJobDetailExtractionConfigs,
} from "#/browser/recruiting-platform-adapters.js";

const searchUrl = "https://we.51job.com/pc/search?keyword=TypeScript";
const detailUrl = "https://jobs.51job.com/synthetic-city/900000001.html";
const defaultMaximumCards = 50;
const firstIndex = 0;
const secondIndex = 1;
const twoCards = 2;
const singleCard = 1;
const capturedAt = "2026-08-01T00:00:00.000Z";

function card(title: string, href?: string) {
  const fields: Record<string, string> = {
    ".area": "合成市·测试区",
    ".cname": "合成雇主甲",
    ".jname": title,
    ".sal": "8千-1.2万·13薪",
  };
  return {
    querySelector: (selector: string) =>
      fields[selector] ? { textContent: fields[selector] } : null,
    querySelectorAll: (selector: string) => {
      if (selector === "a[href]") {
        return href ? [{ href }] : [];
      }
      return selector === ".tags .tag" ? [{ textContent: "合成平台" }] : [];
    },
    textContent: Object.values(fields).join(" "),
  };
}

function capture(cards: ReturnType<typeof card>[], maximumCards = defaultMaximumCards) {
  const input = {
    accessTextCharacters: 5000,
    config: requireJobCardExtractionConfig(searchUrl).config,
    maximumAccessElements: 300,
    maximumCardTextCharacters: 1500,
    maximumCards,
    maximumFieldCharacters: 300,
  };
  return runInNewContext(`(${captureJobCardMetadata.toString()})(input)`, {
    URL,
    document: {
      body: { innerText: "合成搜索结果" },
      querySelectorAll: (selector: string) => (selector === ".joblist-item" ? cards : []),
      title: "合成招聘搜索",
    },
    input,
    location: new URL(searchUrl),
  }) as ReturnType<typeof captureJobCardMetadata>;
}

afterEach(() => vi.unstubAllGlobals());

test("51job uses its login subdomain and recognizes only job detail identities", () => {
  expect(resolvePlatformWebUrl("51job", "login")).toBe("https://login.51job.com/login.php");
  expect(
    recruitingPlatformAdapters["51job"].isLoginPage("https://login.51job.com/login.php?lang=c"),
  ).toBe(true);
  expect(extractExternalJobId("51job", `${detailUrl}?tracking=synthetic`)).toBe("900000001");
  expect(requireJobDetailExtractionConfigs(detailUrl).platformId).toBe("51job");
});

test.each([
  "http://jobs.51job.com/synthetic-city/900000001.html",
  "https://jobs.51job.com.evil.invalid/synthetic-city/900000001.html",
  "https://user:secret@jobs.51job.com/synthetic-city/900000001.html",
  "https://jobs.51job.com:444/synthetic-city/900000001.html",
])("rejects navigation outside the 51job HTTPS scope: %s", (url) => {
  expect(parsePlatformWebUrl("51job", url)).toBeNull();
  expect(extractExternalJobId("51job", url)).toBeNull();
});

test.each([
  "https://jobs.51job.com/all/coSYNTHETIC.html",
  "https://we.51job.com/synthetic-city/900000001.html",
  "https://jobs.51job.com/synthetic-city/not-a-job.html",
])("does not turn company or unrelated pages into detail identities: %s", (url) => {
  expect(extractExternalJobId("51job", url)).toBeNull();
  expect(() => requireJobDetailExtractionConfigs(url)).toThrow();
});

test.each([
  "https://i.51job.com/userset/my_apply.php",
  "https://login.51job.com/login.php",
  detailUrl,
])("excludes account and detail pages from card collection: %s", (url) => {
  expect(() => requireJobCardExtractionConfig(url)).toThrow();
});

test("captures linkless 51job cards without manufacturing source identity", () => {
  const metadata = capture([card("合成系统工程师"), card("合成系统工程师"), card("")]);
  expect(metadata.cards).toEqual([
    {
      company: "合成雇主甲",
      details: ["合成平台"],
      location: "合成市·测试区",
      salary: "8千-1.2万·13薪",
      text: "合成市·测试区 合成雇主甲 合成系统工程师 8千-1.2万·13薪",
      title: "合成系统工程师",
    },
  ]);
  const snapshot = JobCardSnapshot.assert({
    capturedAt,
    cards: structuredClone(metadata.cards),
    platformId: "51job",
    sourceTitle: metadata.title,
    sourceUrl: searchUrl,
    truncated: metadata.truncated,
  });
  const [observation] = observationsFromJobCardSnapshot(snapshot);
  expect(observation).toMatchObject({ platformId: "51job", title: "合成系统工程师" });
  expect(observation).not.toHaveProperty("jobUrl");
  expect(observation).not.toHaveProperty("externalJobId");
});

test("preserves cross-subdomain job links while excluding untrusted link identities", () => {
  const metadata = capture([
    card("合成系统工程师", detailUrl),
    card("合成系统工程师", `${detailUrl}?tracking=synthetic`),
    card("合成分析师", "https://evil.invalid/synthetic-city/900000002.html"),
  ]);
  expect(metadata.cards).toHaveLength(twoCards);
  expect(metadata.cards[firstIndex]).toHaveProperty("href", detailUrl);
  expect(metadata.cards[secondIndex]).not.toHaveProperty("href");
  const observations = observationsFromJobCardSnapshot({
    capturedAt,
    cards: metadata.cards,
    platformId: "51job",
    sourceTitle: metadata.title,
    sourceUrl: searchUrl,
    truncated: false,
  });
  expect(observations[firstIndex]).toMatchObject({ externalJobId: "900000001", jobUrl: detailUrl });
});

test("bounds distinct cards and accepts a collection with no recognizable cards", () => {
  expect(capture([card("合成甲"), card("合成乙")], singleCard)).toMatchObject({ truncated: true });
  expect(capture([])).toMatchObject({ cards: [], truncated: false });
});

test.each([true, false])(
  "keeps 51job facts inside the posting when facts are present: %s",
  (hasFacts) => {
    const fields: Record<string, { innerText?: string; textContent: string }> = {
      ".com_name a": { textContent: "合成雇主甲" },
      ".jTitle": {
        innerText: hasFacts ? "合成系统工程师 8千-1.2万·13薪 3-5年 本科" : "合成系统工程师",
        textContent: "合成系统工程师",
      },
      ".jTitle h1": { textContent: "合成系统工程师" },
      ".jname": { textContent: "合成推荐岗位" },
      ".job-detail .job_msg": {
        innerText: "岗位职责\n维护合成系统。",
        textContent: "岗位职责 维护合成系统。",
      },
      ".job-detail .tags .tag": { textContent: "合成福利" },
      ".sal": { textContent: "8千-1.2万·13薪" },
      ".tags .tag": { textContent: "推荐岗位标签" },
    };
    vi.stubGlobal("document", {
      body: {
        innerText:
          "推荐岗位 30-40万/年 10年以上 博士\n合成系统工程师\n职位描述\n岗位职责\n维护合成系统。",
      },
      querySelector: (selector: string) => fields[selector] ?? null,
      querySelectorAll: (selector: string) => (fields[selector] ? [fields[selector]] : []),
    });
    vi.stubGlobal("location", { href: detailUrl });
    const metadata = captureJobDescriptionMetadata({
      ...requireJobDetailExtractionConfigs(detailUrl),
      accessTextCharacters: 5000,
      maximumAccessElements: 300,
      maximumDescriptionCharacters: 20_000,
      maximumFieldCharacters: 300,
    });
    expect(metadata).toMatchObject({
      company: "合成雇主甲",
      description: "岗位职责\n维护合成系统。",
      details: ["合成福利"],
      educationRequirement: hasFacts ? "本科" : null,
      experienceRequirement: hasFacts ? "3-5年" : null,
      salaryText: hasFacts ? "8千-1.2万·13薪" : null,
      title: "合成系统工程师",
      truncated: false,
    });
  },
);

test.each(["8千-1.2万·13薪", "16-22万/年", "1.5-2.5万元/年"])(
  "preserves the full salary period in a 51job description: %s",
  (salary) => {
    vi.stubGlobal("document", {
      body: { innerText: `合成系统工程师 ${salary}\n职位描述` },
      querySelector: () => null,
      querySelectorAll: (selector: string) =>
        selector === ".jTitle" ? [{ innerText: `合成系统工程师 ${salary}` }] : [],
    });
    vi.stubGlobal("location", { href: detailUrl });
    const metadata = captureJobDescriptionMetadata({
      ...requireJobDetailExtractionConfigs(detailUrl),
      accessTextCharacters: 5000,
      maximumAccessElements: 300,
      maximumDescriptionCharacters: 20_000,
      maximumFieldCharacters: 300,
    });
    expect(metadata.salaryText).toBe(salary);
  },
);
