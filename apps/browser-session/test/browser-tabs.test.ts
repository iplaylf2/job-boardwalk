import type { BrowserContext, Page } from "patchright";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";
import { resolvePlatformWebUrl } from "@job-boardwalk/platform-catalog";

import {
  assertPlatformNavigationLink,
  assertPlatformNavigationUrl,
  findRecruitingPlatformAdapter,
} from "#/browser/recruiting-platform-adapters.js";
import { BrowserTabs, readNavigationPageSummary } from "#/browser/browser-tabs.js";

interface FakePage {
  navigationCount: number;
  page: Page;
  url: string;
}

const firstNavigationCount = 1;
const bossLoginUrl = resolvePlatformWebUrl("boss", "login");
const yupaoLoginUrl = resolvePlatformWebUrl("yupao", "login");
// eslint-disable-next-line no-script-url
const scriptControlHref = "javascript:;";

function fakePage(initialUrl: string, title = "Jobs"): FakePage {
  const state: FakePage = {
    navigationCount: 0,
    page: null as unknown as Page,
    url: initialUrl,
  };
  state.page = {
    bringToFront: () => Promise.resolve(),
    goto: (url: string) => {
      state.navigationCount += 1;
      state.url = url;
      return Promise.resolve(null);
    },
    isClosed: () => false,
    once: () => state.page,
    title: () => Promise.resolve(title),
    url: () => state.url,
  } as unknown as Page;
  return state;
}

function fakeBrowserContext(page: Page): BrowserContext {
  const context = {
    on: () => context,
    pages: () => [page],
  } as unknown as BrowserContext;
  return context;
}

test.each([
  {
    destination: "entry" as const,
    expectedUrl: "https://www.zhipin.com/",
    platformId: "boss" as const,
  },
  {
    destination: "login" as const,
    expectedUrl: "https://www.zhipin.com/web/user/",
    platformId: "boss" as const,
  },
  {
    destination: "entry" as const,
    expectedUrl: "https://www.yupao.com/",
    platformId: "yupao" as const,
  },
  {
    destination: "login" as const,
    expectedUrl: "https://www.yupao.com/web/login/",
    platformId: "yupao" as const,
  },
])(
  "resolves $platformId $destination from its shared web navigation metadata",
  ({ destination, expectedUrl, platformId }) => {
    expect(resolvePlatformWebUrl(platformId, destination)).toBe(expectedUrl);
    expect(findRecruitingPlatformAdapter(expectedUrl)?.platformId).toBe(platformId);
  },
);

test.each([
  { platformId: "boss" as const, url: "https://www.zhipin.com/job_detail/example.html" },
  { platformId: "yupao" as const, url: "https://www.yupao.com/job/123.html" },
])(
  "adapts $platformId HTTPS navigation through the shared platform contract",
  ({ platformId, url }) => {
    expect(findRecruitingPlatformAdapter(url)?.platformId).toBe(platformId);
    expect(() => assertPlatformNavigationUrl(platformId, url)).not.toThrow();
    expect(() => assertPlatformNavigationUrl(platformId, "https://example.invalid/")).toThrow(
      /HTTPS/u,
    );
  },
);

test("does not accept broad hostname similarity or insecure platform URLs", () => {
  expect(findRecruitingPlatformAdapter("https://subdomain.zhipin.com/")?.platformId).toBe("boss");
  expect(findRecruitingPlatformAdapter("https://subdomain.yupao.com/")?.platformId).toBe("yupao");
  expect(findRecruitingPlatformAdapter("http://www.zhipin.com/")).toBeNull();
  expect(findRecruitingPlatformAdapter("https://yupao.com.example.invalid/")).toBeNull();
});

test("rejects explicit external links while allowing in-page script controls", () => {
  expect(() =>
    assertPlatformNavigationLink("boss", "https://www.zhipin.com/web/geek/jobs"),
  ).not.toThrow();
  expect(() => assertPlatformNavigationLink("boss", scriptControlHref)).not.toThrow();
  expect(() => assertPlatformNavigationLink("boss", "https://www.yupao.com/job/123.html")).toThrow(
    /BOSS直聘/u,
  );
  expect(() => assertPlatformNavigationLink("yupao", "mailto:example@example.com")).toThrow(
    /鱼泡直聘/u,
  );
});

test.each([
  {
    initialUrl: "https://www.zhipin.com/beijing/",
    platformId: "boss" as const,
    requestedUrl: "https://www.zhipin.com/web/geek/jobs",
  },
  {
    initialUrl: "https://www.yupao.com/",
    platformId: "yupao" as const,
    requestedUrl: "https://www.yupao.com/job/123.html",
  },
])(
  "ensures a requested $platformId URL through the same tab workflow",
  async ({ initialUrl, platformId, requestedUrl }) => {
    await using scope = createScope();
    const fake = fakePage(initialUrl);
    const tabs = new BrowserTabs(fakeBrowserContext(fake.page));

    const result = await scope.run(() =>
      tabs.executeAction({ action: "ensure", platformId, url: requestedUrl }),
    );

    expect(fake.navigationCount).toBe(firstNavigationCount);
    expect(fake.url).toBe(requestedUrl);
    expect(result).toMatchObject({ platformId, title: "Jobs", url: requestedUrl });
  },
);

test("requires a supported platform when ensuring a tab", () => {
  const fake = fakePage("about:blank");
  const tabs = new BrowserTabs(fakeBrowserContext(fake.page));

  expect(() => tabs.executeAction({ action: "ensure" }).next()).toThrow(/platformId/u);
});

test("prepares the configured login interface in the existing platform tab", async () => {
  await using scope = createScope();
  const fake = fakePage("https://www.zhipin.com/beijing/");
  const tabs = new BrowserTabs(fakeBrowserContext(fake.page));

  const result = await scope.run(() => tabs.prepareLogin({ platformId: "boss" }));

  expect(fake.navigationCount).toBe(firstNavigationCount);
  expect(fake.url).toBe(bossLoginUrl);
  expect(result).toMatchObject({ platformId: "boss", title: "Jobs", url: bossLoginUrl });
});

test("prepares every supported platform through its configured login URL", async () => {
  await using scope = createScope();
  const fake = fakePage("https://www.yupao.com/");
  const tabs = new BrowserTabs(fakeBrowserContext(fake.page));

  const result = await scope.run(() => tabs.prepareLogin({ platformId: "yupao" }));

  expect(fake.navigationCount).toBe(firstNavigationCount);
  expect(fake.url).toBe(yupaoLoginUrl);
  expect(result).toMatchObject({ platformId: "yupao", title: "Jobs", url: yupaoLoginUrl });
});

test("surfaces a page that has left scope instead of reporting navigation success", () => {
  const fake = fakePage("https://example.invalid/");

  expect(() => readNavigationPageSummary(fake.page).next()).toThrow(/招聘平台/u);
});
