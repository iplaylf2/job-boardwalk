import type { BrowserContext, Locator, Page } from "patchright";
import { createScope, run } from "@shajara/host";
import { expect, test } from "vitest";

import { BrowserTabs } from "#/browser/browser-tabs.js";
import { createSyntheticPageLocator } from "./synthetic-page-locator.js";

interface FakePage {
  navigationCount: number;
  page: Page;
  url: string;
}

interface FakePageOptions {
  readonly afterNavigation?: (state: FakePage) => void;
  readonly snapshotElements?: readonly {
    readonly href?: string;
    readonly name: string;
    readonly role: string;
  }[];
  readonly snapshotText?: string;
}

const firstNavigationCount = 1;
const immediateRedirectDelayMilliseconds = 0;
const noNavigations = 0;
const syntheticViewportHeight = 800;
const syntheticViewportWidth = 1200;

function fakePage(initialUrl: string, options: FakePageOptions = {}): FakePage {
  const state: FakePage = {
    navigationCount: 0,
    page: null as unknown as Page,
    url: initialUrl,
  };
  const snapshotElements = options.snapshotElements ?? [
    { name: "Synthetic login control", role: "button" },
  ];
  function snapshot() {
    return Promise.resolve({
      documentReadyState: "complete",
      elements: snapshotElements.map((element, sourceIndex) => ({
        disabled: false,
        href: element.href,
        name: element.name,
        role: element.role,
        signature: `synthetic-${String(sourceIndex)}`,
        sourceIndex,
      })),
      text: options.snapshotText ?? "Synthetic visible login interface",
      title: "Synthetic recruiting platform",
      truncated: false,
      url: state.url,
      viewport: {
        height: syntheticViewportHeight,
        scrollY: noNavigations,
        width: syntheticViewportWidth,
      },
    });
  }
  state.page = {
    bringToFront: () => Promise.resolve(),
    evaluate: snapshot,
    goto: (url: string) => {
      state.navigationCount += firstNavigationCount;
      state.url = url;
      options.afterNavigation?.(state);
      return Promise.resolve(null);
    },
    isClosed: () => false,
    locator: createSyntheticPageLocator({
      nth: () => ({}) as Locator,
      readSnapshot: snapshot,
      title: "Synthetic recruiting platform",
    }),
    once: () => state.page,
    title: () => Promise.resolve("Synthetic recruiting platform"),
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

function deepestFailureMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const failure = value as { cause?: unknown; message?: unknown };
  if (failure.cause) {
    return deepestFailureMessage(failure.cause);
  }
  return typeof failure.message === "string" ? failure.message : null;
}

test.each([
  { initialUrl: "https://www.zhipin.com/beijing/", platformId: "boss" as const },
  { initialUrl: "https://www.yupao.com/", platformId: "yupao" as const },
])("prepares $platformId through its visible configured login interface", async (input) => {
  await using scope = createScope();
  const fake = fakePage(input.initialUrl);
  const tabs = new BrowserTabs(fakeBrowserContext(fake.page));

  const result = await scope.run(() => tabs.prepareLogin({ platformId: input.platformId }));

  expect(fake.navigationCount).toBe(firstNavigationCount);
  expect(result).toMatchObject({
    outcome: "handoff-ready",
    platformId: input.platformId,
  });
});

test("does not navigate or hand off when the reused platform page is already authenticated", async () => {
  await using scope = createScope();
  const fake = fakePage("https://www.yupao.com/a2/", {
    snapshotElements: [],
    snapshotText: ["首页", "职位", "公司", "校园", "消息", "简历", "合成求职者"].join("\n"),
  });
  const tabs = new BrowserTabs(fakeBrowserContext(fake.page));

  const result = await scope.run(() => tabs.prepareLogin({ platformId: "yupao" }));

  expect(fake.navigationCount).toBe(noNavigations);
  expect(result).toMatchObject({
    outcome: "already-authenticated",
    url: "https://www.yupao.com/a2/",
  });
});

test("rejects a blank login route instead of handing off an unusable page", async () => {
  const fake = fakePage("https://www.yupao.com/", {
    snapshotElements: [],
    snapshotText: "",
  });
  const tabs = new BrowserTabs(fakeBrowserContext(fake.page));

  const failure = await run(() => tabs.prepareLogin({ platformId: "yupao" })).catch(
    (error: unknown) => error,
  );
  expect(deepestFailureMessage(failure)).toMatch(/鱼泡直聘登录交接尚未就绪/u);
});

test("rejects a login handoff when the platform leaves its login page after navigation", async () => {
  const fake = fakePage("https://www.yupao.com/", {
    afterNavigation: (state) => {
      setTimeout(() => {
        state.url = "https://www.yupao.com/a2/?ignored=sensitive";
      }, immediateRedirectDelayMilliseconds);
    },
  });
  const tabs = new BrowserTabs(fakeBrowserContext(fake.page));

  const failure = await run(() => tabs.prepareLogin({ platformId: "yupao" })).catch(
    (error: unknown) => error,
  );
  const failureMessage = deepestFailureMessage(failure);
  expect(failureMessage).toContain("https://www.yupao.com/a2/");
  expect(failureMessage).not.toContain("ignored=sensitive");
});
