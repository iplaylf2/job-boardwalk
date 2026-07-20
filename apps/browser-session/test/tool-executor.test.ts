import type { BrowserContext, Locator, Page } from "patchright";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { PlatformAccessObserver } from "#/browser/platform-access-observer.js";
import { BrowserToolExecutor } from "#/browser/tool-executor.js";

const accountLinks = [
  ["消息", "https://www.zhipin.com/web/geek/chat"],
  ["简历", "https://www.zhipin.com/web/geek/resume"],
  ["个人中心", "https://www.zhipin.com/web/geek/recommend"],
] as const;
const firstLocatorIndex = 0;
const expectedActionCount = 1;

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

function fakeAuthenticatedYupaoJobCardPage(): Page {
  const url = "https://www.yupao.com/topic/a2c1488/";
  const page = {
    evaluate: () =>
      Promise.resolve({
        accessElements: [],
        accessText: "消息\n简历\n测试用户\n推荐",
        cards: [],
        title: "北京招聘信息 - 鱼泡直聘",
        truncated: false,
        url,
      }),
    isClosed: () => false,
    once: () => page,
    url: () => url,
  } as unknown as Page;
  return page;
}

function fakeActionPage(element: { href?: string; name: string; role: string }) {
  const signature = `${element.role}:${element.name}:${element.href ?? ""}`;
  const state = {
    clickCount: 0,
    filledValues: [] as string[],
    selectedValues: [] as string[],
    url: "https://www.zhipin.com/",
  };
  const locator = {
    click: () => {
      state.clickCount += 1;
      return Promise.resolve();
    },
    evaluate: () => Promise.resolve(signature),
    fill: (value: string) => {
      state.filledValues.push(value);
      return Promise.resolve();
    },
    scrollIntoViewIfNeeded: () => Promise.resolve(),
    selectOption: (value: string) => {
      state.selectedValues.push(value);
      return Promise.resolve([]);
    },
  } as unknown as Locator;
  const page = {
    evaluate: () =>
      Promise.resolve({
        elements: [
          {
            ...element,
            disabled: false,
            signature,
            sourceIndex: firstLocatorIndex,
          },
        ],
        text: element.name,
        title: "BOSS直聘",
        truncated: false,
        url: state.url,
        viewport: { height: 900, scrollY: 0, width: 1200 },
      }),
    isClosed: () => false,
    locator: () => ({ nth: () => locator }),
    once: () => page,
    title: () => Promise.resolve("BOSS直聘"),
    url: () => state.url,
  } as unknown as Page;
  return { page, state };
}

test("returns and queues an adapter-owned access observation with a bounded snapshot", async () => {
  const context = fakeContext(fakeAuthenticatedBossPage());
  const observer = new PlatformAccessObserver(context);
  const executor = new BrowserToolExecutor(
    context,
    (page) => observer.observePage(page),
    () => null,
  );
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

test("records returned control only when a snapshot explicitly declares it", async () => {
  const context = fakeContext(fakeAuthenticatedBossPage());
  const returnedControlPlatforms: PlatformId[] = [];
  const executor = new BrowserToolExecutor(
    context,
    () => null,
    (platformId) => returnedControlPlatforms.push(platformId),
  );
  await using scope = createScope();

  await scope.run(() => executor.execute("browser_snapshot", {}));
  expect(returnedControlPlatforms).toEqual([]);

  await scope.run(() => executor.execute("browser_snapshot", { userReturnedControl: true }));
  expect(returnedControlPlatforms).toEqual(["boss"]);
});

test("refreshes platform access evidence while reading job cards", async () => {
  const context = fakeContext(fakeAuthenticatedYupaoJobCardPage());
  const observer = new PlatformAccessObserver(context);
  const executor = new BrowserToolExecutor(
    context,
    (page) => observer.observePage(page),
    () => null,
  );
  await using scope = createScope();

  await scope.run(() => executor.execute("browser_job_card_snapshot", {}));

  expect(observer.observations).toEqual([
    expect.objectContaining({
      authenticationState: "authenticated",
      evidence: "authenticated-page",
      platformId: "yupao",
    }),
  ]);
});

test("clicks a same-platform link through its captured element", async () => {
  const fake = fakeActionPage({
    href: "https://www.zhipin.com/job_detail/example.html",
    name: "查看职位",
    role: "link",
  });
  const executor = new BrowserToolExecutor(
    fakeContext(fake.page),
    () => null,
    () => null,
  );
  await using scope = createScope();

  await scope.run(() => executor.execute("browser_snapshot", {}));
  await scope.run(() => executor.execute("browser_click", { ref: "e1" }));

  expect(fake.state.clickCount).toBe(expectedActionCount);
});

test("fills a captured text control without classifying its business purpose", async () => {
  const input = fakeActionPage({
    name: "筛选条件",
    role: "textbox",
  });
  const executor = new BrowserToolExecutor(
    fakeContext(input.page),
    () => null,
    () => null,
  );
  await using scope = createScope();
  await scope.run(() => executor.execute("browser_snapshot", {}));
  await scope.run(() => executor.execute("browser_fill", { ref: "e1", value: "Node.js" }));
  expect(input.state.filledValues).toEqual(["Node.js"]);
});

test("clicks a captured page button without classifying its business purpose", async () => {
  const button = fakeActionPage({
    name: "展开筛选",
    role: "button",
  });
  const executor = new BrowserToolExecutor(
    fakeContext(button.page),
    () => null,
    () => null,
  );
  await using scope = createScope();
  await scope.run(() => executor.execute("browser_snapshot", {}));
  await scope.run(() => executor.execute("browser_click", { ref: "e1" }));
  expect(button.state.clickCount).toBe(expectedActionCount);
});

test("selects an option in a captured selection control", async () => {
  const select = fakeActionPage({
    name: "经验要求",
    role: "combobox",
  });
  const executor = new BrowserToolExecutor(
    fakeContext(select.page),
    () => null,
    () => null,
  );
  await using scope = createScope();
  await scope.run(() => executor.execute("browser_snapshot", {}));
  await scope.run(() => executor.execute("browser_select", { ref: "e1", value: "3-5年" }));
  expect(select.state.selectedValues).toEqual(["3-5年"]);
});
