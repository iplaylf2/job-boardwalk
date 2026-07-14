import type { Browser, BrowserContext, Page } from "patchright";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { assertResearchLink, assertResearchUrl, isResearchUrl } from "#/browser/research-scope.js";
import { ResearchTabs, readPageIdentity } from "#/browser/research-tabs.js";

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

function fakeBrowser(page: Page): Browser {
  const context = {
    on: () => context,
    pages: () => [page],
  } as unknown as BrowserContext;
  return { contexts: () => [context] } as unknown as Browser;
}

test("defines URL scope as BOSS HTTPS rather than broad hostname similarity", () => {
  expect(isResearchUrl("https://www.zhipin.com/job_detail/example.html")).toBe(true);
  expect(isResearchUrl("https://subdomain.zhipin.com/")).toBe(true);
  expect(isResearchUrl("http://www.zhipin.com/")).toBe(false);
  expect(isResearchUrl("https://zhipin.com.example.invalid/")).toBe(false);
  expect(() => assertResearchUrl("https://example.invalid/")).toThrow(/BOSS HTTPS/u);
});

test("rejects explicit external links while allowing in-page script controls", () => {
  expect(() => assertResearchLink("https://www.zhipin.com/web/geek/jobs")).not.toThrow();
  expect(() => assertResearchLink(scriptControlHref)).not.toThrow();
  expect(() => assertResearchLink("https://weibo.com/bosszhipin")).toThrow(/BOSS HTTPS/u);
  expect(() => assertResearchLink("mailto:example@example.com")).toThrow(/BOSS HTTPS/u);
});

test("navigates an existing BOSS tab when open receives a different explicit URL", async () => {
  await using scope = createScope();
  const fake = fakePage("https://www.zhipin.com/beijing/");
  const tabs = new ResearchTabs(fakeBrowser(fake.page));
  const requestedUrl = "https://www.zhipin.com/web/geek/jobs";

  const result = await scope.run(() => tabs.execute({ action: "open", url: requestedUrl }));

  expect(fake.navigationCount).toBe(firstNavigationCount);
  expect(fake.url).toBe(requestedUrl);
  expect(result).toMatchObject({ title: "BOSS", url: requestedUrl });
});

test("surfaces a page that has left scope instead of reporting navigation success", () => {
  const fake = fakePage("https://example.invalid/");

  expect(() => readPageIdentity(fake.page).next()).toThrow(/BOSS HTTPS/u);
});
