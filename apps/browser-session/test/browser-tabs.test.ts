import type { BrowserContext, Page } from "patchright";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import {
  assertBossNavigationLink,
  assertBossNavigationUrl,
  isBossNavigationUrl,
} from "#/browser/boss-navigation-scope.js";
import { BrowserTabs, readNavigationPageSummary } from "#/browser/browser-tabs.js";

interface FakePage {
  navigationCount: number;
  page: Page;
  url: string;
}

const firstNavigationCount = 1;
// eslint-disable-next-line no-script-url
const scriptControlHref = "javascript:;";

function fakePage(initialUrl: string): FakePage {
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
    title: () => Promise.resolve("BOSS"),
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

test("defines the BOSS navigation scope without broad hostname similarity", () => {
  expect(isBossNavigationUrl("https://www.zhipin.com/job_detail/example.html")).toBe(true);
  expect(isBossNavigationUrl("https://subdomain.zhipin.com/")).toBe(true);
  expect(isBossNavigationUrl("http://www.zhipin.com/")).toBe(false);
  expect(isBossNavigationUrl("https://zhipin.com.example.invalid/")).toBe(false);
  expect(() => assertBossNavigationUrl("https://example.invalid/")).toThrow(/BOSS HTTPS/u);
});

test("rejects explicit external links while allowing in-page script controls", () => {
  expect(() => assertBossNavigationLink("https://www.zhipin.com/web/geek/jobs")).not.toThrow();
  expect(() => assertBossNavigationLink(scriptControlHref)).not.toThrow();
  expect(() => assertBossNavigationLink("https://weibo.com/bosszhipin")).toThrow(/BOSS HTTPS/u);
  expect(() => assertBossNavigationLink("mailto:example@example.com")).toThrow(/BOSS HTTPS/u);
});

test("ensures a requested URL by navigating the existing BOSS tab", async () => {
  await using scope = createScope();
  const fake = fakePage("https://www.zhipin.com/beijing/");
  const tabs = new BrowserTabs(fakeBrowserContext(fake.page));
  const requestedUrl = "https://www.zhipin.com/web/geek/jobs";

  const result = await scope.run(() => tabs.executeAction({ action: "ensure", url: requestedUrl }));

  expect(fake.navigationCount).toBe(firstNavigationCount);
  expect(fake.url).toBe(requestedUrl);
  expect(result).toMatchObject({ title: "BOSS", url: requestedUrl });
});

test("surfaces a page that has left scope instead of reporting navigation success", () => {
  const fake = fakePage("https://example.invalid/");

  expect(() => readNavigationPageSummary(fake.page).next()).toThrow(/BOSS HTTPS/u);
});
