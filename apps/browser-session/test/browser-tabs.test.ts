// oxlint-disable max-lines -- Exercise tab lifecycle and navigation through the same synthetic context.
import type { BrowserContext, Page } from "patchright";
import { errors } from "patchright";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";
import { resolvePlatformWebUrl } from "@job-boardwalk/platform-catalog";

import {
  assertPlatformClickTarget,
  assertPlatformNavigationUrl,
  findRecruitingPlatformAdapter,
} from "#/browser/recruiting-platform-adapters.js";
import { BrowserTabs } from "#/browser/browser-tabs.js";
import { readNavigationPageSummary } from "#/browser/page-navigation.js";

interface FakePage {
  activationCount: number;
  navigationCount: number;
  page: Page;
  url: string;
}

const firstNavigationCount = 1;
const secondNavigationCount = 2;
const firstActivationCount = 1;
const noNavigations = 0;
// eslint-disable-next-line no-script-url
const scriptControlHref = "javascript:;";

function fakePage(initialUrl: string, title = "Jobs"): FakePage {
  const state: FakePage = {
    activationCount: 0,
    navigationCount: 0,
    page: null as unknown as Page,
    url: initialUrl,
  };
  let closed = false;
  let onClose: (() => void) | null = null;
  state.page = {
    bringToFront: () => {
      state.activationCount += 1;
      return Promise.resolve();
    },
    close: () => {
      closed = true;
      onClose?.();
      return Promise.resolve();
    },
    goto: (url: string) => {
      state.navigationCount += 1;
      state.url = url;
      return Promise.resolve(null);
    },
    isClosed: () => closed,
    locator: () => ({
      evaluate: () =>
        Promise.resolve({ documentReadyState: "complete", outcome: "observed", title }),
    }),
    once: (_event: string, callback: () => void) => {
      onClose = callback;
      return state.page;
    },
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
  expect(findRecruitingPlatformAdapter("https://user:secret@www.yupao.com/")).toBeNull();
  expect(findRecruitingPlatformAdapter("https://www.zhipin.com:8443/")).toBeNull();
});

test("allows same-platform HTTPS links and no-op page controls", () => {
  expect(() =>
    assertPlatformClickTarget("boss", "https://www.zhipin.com/web/geek/jobs"),
  ).not.toThrow();
  expect(() => assertPlatformClickTarget("boss", scriptControlHref)).not.toThrow();
  expect(() => assertPlatformClickTarget("boss", "https://www.yupao.com/job/123.html")).toThrow(
    /BOSS直聘/u,
  );
  expect(() => assertPlatformClickTarget("yupao", "mailto:example@example.com")).toThrow(
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
    expect(result).toMatchObject({
      navigation: { outcome: "completed", waitUntil: "domcontentloaded" },
      pageInspection: { documentReadyState: "complete", outcome: "observed" },
      platformId,
      title: "Jobs",
      url: requestedUrl,
    });
  },
);

test("returns a timed-out navigation with an independent page inspection", async () => {
  await using scope = createScope();
  const requestedUrl = "https://www.zhipin.com/beijing/";
  const fake = fakePage("about:blank");
  fake.page.goto = (url: string) => {
    fake.navigationCount += firstNavigationCount;
    fake.url = url;
    return Promise.reject(new errors.TimeoutError("synthetic navigation timeout"));
  };
  fake.page.locator = () =>
    ({
      evaluate: () =>
        Promise.resolve({
          documentReadyState: "loading",
          outcome: "observed",
          title: "Loading",
        }),
    }) as never;
  const tabs = new BrowserTabs(fakeBrowserContext(fake.page));

  const result = await scope.run(() =>
    tabs.executeAction({ action: "ensure", platformId: "boss", url: requestedUrl }),
  );

  expect(fake.navigationCount).toBe(firstNavigationCount);
  expect(result).toMatchObject({
    navigation: { outcome: "timed-out", waitUntil: "domcontentloaded" },
    pageInspection: { documentReadyState: "loading", outcome: "observed" },
    requestedUrl,
    url: requestedUrl,
  });
});

test("leaves repeated unclassified timeouts to the caller without automatic page recovery", async () => {
  await using scope = createScope();
  const requestedUrl = "https://www.zhipin.com/web/geek/jobs";
  const fake = fakePage("https://www.zhipin.com/");
  fake.page.goto = () => {
    fake.navigationCount += firstNavigationCount;
    return Promise.reject(new errors.TimeoutError("synthetic navigation timeout"));
  };
  fake.page.locator = () =>
    ({
      evaluate: () => Promise.reject(new errors.TimeoutError("synthetic inspection timeout")),
    }) as never;
  const tabs = new BrowserTabs(fakeBrowserContext(fake.page));

  const first = await scope.run(() =>
    tabs.executeAction({ action: "ensure", platformId: "boss", url: requestedUrl }),
  );
  const second = await scope.run(() =>
    tabs.executeAction({ action: "ensure", platformId: "boss", url: requestedUrl }),
  );

  expect(first).toMatchObject({
    navigation: { outcome: "timed-out" },
    pageInspection: { outcome: "timed-out" },
  });
  expect(second).toMatchObject({
    navigation: { outcome: "timed-out" },
    pageInspection: { outcome: "timed-out" },
  });
  expect(fake.navigationCount).toBe(secondNavigationCount);
  expect(tabs.tabCount).toBe(firstNavigationCount);
});

test("requires a supported platform when ensuring a tab", () => {
  const fake = fakePage("about:blank");
  const tabs = new BrowserTabs(fakeBrowserContext(fake.page));

  expect(() => tabs.executeAction({ action: "ensure" }).next()).toThrow(/platformId/u);
});

test("reports that navigation was already current when ensure reuses the platform page", async () => {
  await using scope = createScope();
  const fake = fakePage("https://www.zhipin.com/beijing/");
  const tabs = new BrowserTabs(fakeBrowserContext(fake.page));

  const result = await scope.run(() =>
    tabs.executeAction({ action: "ensure", platformId: "boss" }),
  );

  expect(fake.navigationCount).toBe(noNavigations);
  expect(result).toMatchObject({ navigation: { outcome: "already-current" } });
});

test("selects an externally managed page through the shared tab owner", async () => {
  const fake = fakePage("https://www.zhipin.com/web/geek/recommend");
  const tabs = new BrowserTabs(fakeBrowserContext(fake.page));
  await using scope = createScope();

  await scope.run(() => tabs.selectPage(fake.page));
  const result = await scope.run(() => tabs.executeAction({ action: "list" }));

  expect(fake.activationCount).toBe(firstActivationCount);
  expect(result).toEqual({
    tabs: [expect.objectContaining({ active: true, platformId: "boss" })],
  });
});

test("returns observed URL without reading a document outside platform scope", async () => {
  const fake = fakePage("https://example.invalid/");

  await using scope = createScope();
  expect(await scope.run(() => readNavigationPageSummary(fake.page))).toEqual({
    pageInspection: null,
    platformId: null,
    url: "https://example.invalid/",
  });
});

test.each([false, true])(
  "preserves navigation outcome when the page leaves scope (timeout=%s)",
  async (timeout) => {
    const fake = fakePage("about:blank");
    fake.page.goto = () => {
      fake.navigationCount += firstNavigationCount;
      fake.url = "about:blank";
      return timeout
        ? Promise.reject(new errors.TimeoutError("synthetic timeout"))
        : Promise.resolve(null);
    };
    const tabs = new BrowserTabs(fakeBrowserContext(fake.page));
    await using scope = createScope();
    const result = await scope.run(() =>
      tabs.executeAction({ action: "ensure", platformId: "boss" }),
    );
    expect(result).toMatchObject({
      navigation: { outcome: timeout ? "timed-out" : "completed" },
      pageInspection: null,
      platformId: null,
      url: "about:blank",
    });
    expect(fake.navigationCount).toBe(firstNavigationCount);
  },
);

test("closes the explicit platform tab and selects a remaining supported tab", async () => {
  const first = fakePage("https://www.51job.com/");
  const second = fakePage("https://www.yupao.com/");
  const outside = fakePage("https://example.invalid/");
  const context = {
    on: () => null,
    pages: () => [first.page, second.page, outside.page],
  } as unknown as BrowserContext;
  const tabs = new BrowserTabs(context);
  await using scope = createScope();
  const result = await scope.run(() => tabs.executeAction({ action: "close", tabId: 2 }));
  expect(second.page.isClosed()).toBe(true);
  expect(first.activationCount).toBe(firstActivationCount);
  expect(outside.page.isClosed()).toBe(false);
  expect(result).toMatchObject({ tabs: [{ active: true, id: 1 }] });
  expect(await scope.run(() => tabs.executeAction({ action: "close", tabId: 1 }))).toEqual({
    tabs: [],
  });
  expect(tabs.tabCount).toBe(firstNavigationCount);
});

test.each([
  { code: "invalid-input", input: { action: "close" } },
  { code: "tab-unavailable", input: { action: "close", tabId: 2 } },
  { code: "outside-platform-scope", input: { action: "close", tabId: 1 } },
])("rejects unsafe close targets: $code", async ({ input, code }) => {
  const fake = fakePage("https://example.invalid/");
  const tabs = new BrowserTabs(fakeBrowserContext(fake.page));
  await using scope = createScope();
  const failure = await scope.run(function* rejectedClose() {
    try {
      yield* tabs.executeAction(input);
    } catch (error) {
      return error;
    }
    return null;
  });
  expect(failure).toMatchObject({ failure: { code } });
  expect(fake.page.isClosed()).toBe(false);
});
