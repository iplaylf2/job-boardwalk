import { errors } from "patchright";
import type { BrowserContext, Locator, Page } from "patchright";
import { createScope, run } from "@shajara/host";
import { expect, test } from "vitest";

import { BrowserTabs } from "#/browser/browser-tabs.js";
import {
  derivePageAccessObservation,
  PlatformAccessObserver,
} from "#/browser/platform-access-observer.js";
import type { PageAccessFacts } from "#/browser/recruiting-platform-adapters.js";
import { createSyntheticPageLocator } from "./synthetic-page-locator.js";

interface FakePage {
  navigationCount: number;
  page: Page;
  url: string;
}

interface FakePageOptions {
  readonly afterNavigation?: (state: FakePage) => void;
  readonly navigationError?: Error;
  readonly snapshotError?: Error;
  readonly snapshotElements?: readonly {
    readonly href?: string;
    readonly name: string;
    readonly role: string;
  }[];
  readonly snapshotText?: string | ((state: FakePage) => string);
}

const firstNavigationCount = 1;
const immediateRedirectDelayMilliseconds = 0;
const noNavigations = 0;
const syntheticViewportHeight = 800;
const syntheticViewportWidth = 1200;
const syntheticYupaoAuthenticatedText = [
  "首页",
  "职位",
  "公司",
  "校园",
  "消息",
  "简历",
  "合成求职者",
].join("\n");
function observePageAccess(page: PageAccessFacts) {
  return derivePageAccessObservation(page);
}

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
    if (options.snapshotError) {
      return Promise.reject(options.snapshotError);
    }
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
      text:
        typeof options.snapshotText === "function"
          ? options.snapshotText(state)
          : (options.snapshotText ?? "Synthetic visible login interface"),
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
      return options.navigationError
        ? Promise.reject(options.navigationError)
        : Promise.resolve(null);
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

function fakeBrowserContext(...pages: Page[]): BrowserContext {
  const context = {
    on: () => context,
    pages: () => pages,
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

  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: input.platformId }, observePageAccess),
  );

  expect(fake.navigationCount).toBe(firstNavigationCount);
  expect(result).toMatchObject({
    outcome: "handoff-ready",
    platformId: input.platformId,
  });
});

test("prepares login from page evidence after the navigation wait times out", async () => {
  await using scope = createScope();
  const fake = fakePage("https://www.yupao.com/", {
    navigationError: new errors.TimeoutError("synthetic navigation timeout"),
  });
  const tabs = new BrowserTabs(fakeBrowserContext(fake.page));

  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, observePageAccess),
  );

  expect(fake.navigationCount).toBe(firstNavigationCount);
  expect(result).toMatchObject({
    outcome: "handoff-ready",
    platformId: "yupao",
    url: "https://www.yupao.com/web/login/",
  });
});

test("does not navigate or hand off when the reused platform page is already authenticated", async () => {
  await using scope = createScope();
  const fake = fakePage("https://www.yupao.com/a2/", {
    snapshotElements: [],
    snapshotText: syntheticYupaoAuthenticatedText,
  });
  const tabs = new BrowserTabs(fakeBrowserContext(fake.page));

  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, observePageAccess),
  );

  expect(fake.navigationCount).toBe(noNavigations);
  expect(result).toMatchObject({
    outcome: "already-authenticated",
    url: "https://www.yupao.com/a2/",
  });
});

test("checks every platform page before preparing a login handoff", async () => {
  await using scope = createScope();
  const unauthenticated = fakePage("https://www.yupao.com/a2/", {
    snapshotElements: [],
    snapshotText: "Synthetic public recruiting page",
  });
  const authenticated = fakePage("https://www.yupao.com/a2/", {
    snapshotElements: [],
    snapshotText: syntheticYupaoAuthenticatedText,
  });
  const tabs = new BrowserTabs(fakeBrowserContext(unauthenticated.page, authenticated.page));

  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, observePageAccess),
  );

  expect(unauthenticated.navigationCount).toBe(noNavigations);
  expect(authenticated.navigationCount).toBe(noNavigations);
  expect(result).toMatchObject({
    id: 2,
    outcome: "already-authenticated",
    url: "https://www.yupao.com/a2/",
  });
});

test("continues past an unreadable platform page when checking authentication", async () => {
  await using scope = createScope();
  const unreadable = fakePage("https://www.yupao.com/a2/", {
    snapshotError: new errors.TimeoutError("synthetic snapshot timeout"),
  });
  const authenticated = fakePage("https://www.yupao.com/a2/", {
    snapshotElements: [],
    snapshotText: syntheticYupaoAuthenticatedText,
  });
  const tabs = new BrowserTabs(fakeBrowserContext(unreadable.page, authenticated.page));

  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, observePageAccess),
  );

  expect(unreadable.navigationCount).toBe(noNavigations);
  expect(authenticated.navigationCount).toBe(noNavigations);
  expect(result).toMatchObject({
    id: 2,
    outcome: "already-authenticated",
    url: "https://www.yupao.com/a2/",
  });
});

test("records authentication observed after navigating to prepare login", async () => {
  await using scope = createScope();
  const fake = fakePage("https://www.yupao.com/", {
    snapshotElements: [],
    snapshotText: (state) =>
      state.navigationCount === noNavigations
        ? "Synthetic public recruiting page"
        : syntheticYupaoAuthenticatedText,
  });
  const context = fakeBrowserContext(fake.page);
  const observer = new PlatformAccessObserver(context);
  const tabs = new BrowserTabs(context);

  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, (page) => observer.observePage(page)),
  );

  expect(fake.navigationCount).toBe(firstNavigationCount);
  expect(result).toMatchObject({ outcome: "already-authenticated", platformId: "yupao" });
  expect(observer.observations).toEqual([
    expect.objectContaining({ authenticationState: "authenticated", platformId: "yupao" }),
  ]);
});

test("rejects a blank login route instead of handing off an unusable page", async () => {
  const fake = fakePage("https://www.yupao.com/", {
    snapshotElements: [],
    snapshotText: "",
  });
  const tabs = new BrowserTabs(fakeBrowserContext(fake.page));

  const failure = await run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, observePageAccess),
  ).catch((error: unknown) => error);
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

  const failure = await run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, observePageAccess),
  ).catch((error: unknown) => error);
  const failureMessage = deepestFailureMessage(failure);
  expect(failureMessage).toContain("https://www.yupao.com/a2/");
  expect(failureMessage).not.toContain("ignored=sensitive");
});
