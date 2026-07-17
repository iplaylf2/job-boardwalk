import type { BrowserContext, Locator, Page } from "patchright";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { PlatformAccessObserver } from "#/browser/platform-access-observer.js";
import { BrowserToolExecutor } from "#/browser/tool-executor.js";

const accountLinks = [
  ["消息", "https://www.zhipin.com/web/geek/chat"],
  ["简历", "https://www.zhipin.com/web/geek/resume"],
  ["个人中心", "https://www.zhipin.com/web/geek/recommend"],
] as const;

function fakeAuthenticatedBossPage(): Page {
  const locator = {
    nth: () => ({}) as Locator,
  };
  const page = {
    evaluate: () =>
      Promise.resolve({
        elements: accountLinks.map(([name, href], sourceIndex) => ({
          disabled: false,
          href,
          name,
          role: "link",
          signature: `${name}:${href}`,
          sourceIndex,
        })),
        text: "消息 简历 个人中心",
        title: "BOSS直聘",
        truncated: false,
        url: "https://www.zhipin.com/beijing/",
        viewport: { height: 900, scrollY: 0, width: 1200 },
      }),
    isClosed: () => false,
    locator: () => locator,
    once: () => page,
    url: () => "https://www.zhipin.com/beijing/",
  } as unknown as Page;
  return page;
}

function fakeContext(page: Page): BrowserContext {
  const context = {
    on: () => context,
    pages: () => [page],
  } as unknown as BrowserContext;
  return context;
}

test("returns and queues an adapter-owned access observation with a bounded snapshot", async () => {
  const context = fakeContext(fakeAuthenticatedBossPage());
  const observer = new PlatformAccessObserver(context);
  const executor = new BrowserToolExecutor(context, (page) => observer.observePage(page));
  await using scope = createScope();

  const result = await scope.run(() => executor.execute("browser_snapshot", {}));

  expect(result).toMatchObject({
    platformAccessObservation: {
      authenticationState: "authenticated",
      evidence: "authenticated-page",
      platformId: "boss",
    },
  });
  expect(observer.observations).toEqual([
    expect.objectContaining({
      authenticationState: "authenticated",
      evidence: "authenticated-page",
      platformId: "boss",
    }),
  ]);
  expect(JSON.stringify(observer.observations)).not.toMatch(/消息|简历|个人中心|\/web\/geek\//u);
});
