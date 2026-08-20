import { errors } from "patchright";
import { createScope, run } from "@shajara/host";
import { expect, test } from "vitest";

import { BrowserTabs } from "#/browser/browser-tabs.js";
import {
  derivePageAccessObservation,
  PlatformAccessObserver,
} from "#/browser/platform-access-observer.js";
import type { PageAccessFacts } from "#/browser/recruiting-platform-adapters.js";
import {
  syntheticBrowserContext,
  syntheticBrowserContextWithNewPage,
  syntheticLoginPage,
} from "./synthetic-login-handoff.js";

const firstNavigationCount = 1;
const noNavigations = 0;
const immediateRedirectDelayMilliseconds = 0;
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
])("preserves an unclassified $platformId page while preparing login", async (input) => {
  await using scope = createScope();
  const existing = syntheticLoginPage(input.initialUrl);
  const created = syntheticLoginPage("about:blank");
  const tabs = new BrowserTabs(syntheticBrowserContextWithNewPage(created.page, existing.page));

  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: input.platformId }, observePageAccess),
  );

  expect(existing.navigationCount).toBe(noNavigations);
  expect(existing.url).toBe(input.initialUrl);
  expect(created.navigationCount).toBe(firstNavigationCount);
  expect(result).toMatchObject({
    outcome: "handoff-ready",
    platformId: input.platformId,
  });
});

test("prepares login from page evidence after the navigation wait times out", async () => {
  await using scope = createScope();
  const existing = syntheticLoginPage("https://www.yupao.com/");
  const created = syntheticLoginPage("about:blank", {
    navigationError: new errors.TimeoutError("synthetic navigation timeout"),
  });
  const tabs = new BrowserTabs(syntheticBrowserContextWithNewPage(created.page, existing.page));

  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, observePageAccess),
  );

  expect(existing.navigationCount).toBe(noNavigations);
  expect(created.navigationCount).toBe(firstNavigationCount);
  expect(result).toMatchObject({
    outcome: "handoff-ready",
    platformId: "yupao",
    url: "https://www.yupao.com/web/login/",
  });
});

test("does not navigate or hand off when the reused platform page is already authenticated", async () => {
  await using scope = createScope();
  const fake = syntheticLoginPage("https://www.yupao.com/a2/", {
    snapshotElements: [],
    snapshotText: syntheticYupaoAuthenticatedText,
  });
  const tabs = new BrowserTabs(syntheticBrowserContext(fake.page));

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
  const unauthenticated = syntheticLoginPage("https://www.yupao.com/a2/", {
    snapshotElements: [],
    snapshotText: "Synthetic public recruiting page",
  });
  const authenticated = syntheticLoginPage("https://www.yupao.com/a2/", {
    snapshotElements: [],
    snapshotText: syntheticYupaoAuthenticatedText,
  });
  const tabs = new BrowserTabs(syntheticBrowserContext(unauthenticated.page, authenticated.page));

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
  const unreadable = syntheticLoginPage("https://www.yupao.com/a2/", {
    snapshotError: new errors.TimeoutError("synthetic snapshot timeout"),
  });
  const authenticated = syntheticLoginPage("https://www.yupao.com/a2/", {
    snapshotElements: [],
    snapshotText: syntheticYupaoAuthenticatedText,
  });
  const tabs = new BrowserTabs(syntheticBrowserContext(unreadable.page, authenticated.page));

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

test("preserves unreadable and unclassified platform pages while preparing login", async () => {
  await using scope = createScope();
  const unreadable = syntheticLoginPage("https://www.yupao.com/a2/", {
    snapshotError: new errors.TimeoutError("synthetic snapshot timeout"),
  });
  const verification = syntheticLoginPage("https://www.yupao.com/web/verify/", {
    snapshotText: "Synthetic identity verification challenge",
  });
  const created = syntheticLoginPage("about:blank");
  const tabs = new BrowserTabs(
    syntheticBrowserContextWithNewPage(created.page, unreadable.page, verification.page),
  );

  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, observePageAccess),
  );

  expect(unreadable.navigationCount).toBe(noNavigations);
  expect(verification.navigationCount).toBe(noNavigations);
  expect(verification.url).toBe("https://www.yupao.com/web/verify/");
  expect(created.navigationCount).toBe(firstNavigationCount);
  expect(result).toMatchObject({
    id: 3,
    outcome: "handoff-ready",
    url: "https://www.yupao.com/web/login/",
  });
});

test("preserves an unreadable platform page by preparing login in a new page", async () => {
  await using scope = createScope();
  const unreadable = syntheticLoginPage("https://www.yupao.com/a2/", {
    snapshotError: new errors.TimeoutError("synthetic snapshot timeout"),
  });
  const created = syntheticLoginPage("about:blank");
  const tabs = new BrowserTabs(syntheticBrowserContextWithNewPage(created.page, unreadable.page));

  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, observePageAccess),
  );

  expect(unreadable.navigationCount).toBe(noNavigations);
  expect(unreadable.url).toBe("https://www.yupao.com/a2/");
  expect(created.navigationCount).toBe(firstNavigationCount);
  expect(result).toMatchObject({
    id: 2,
    outcome: "handoff-ready",
    url: "https://www.yupao.com/web/login/",
  });
});

test("reuses an observed page that remains on the login route", async () => {
  await using scope = createScope();
  const login = syntheticLoginPage("https://www.yupao.com/web/login/");
  const tabs = new BrowserTabs(syntheticBrowserContext(login.page));

  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, observePageAccess),
  );

  expect(login.navigationCount).toBe(noNavigations);
  expect(result).toMatchObject({ id: 1, outcome: "handoff-ready" });
});

test("preserves a login page that leaves the login route after observation", async () => {
  await using scope = createScope();
  const login = syntheticLoginPage("https://www.yupao.com/web/login/", {
    afterSnapshot: (state) => {
      state.url = "https://www.yupao.com/web/verify/";
    },
  });
  const created = syntheticLoginPage("about:blank");
  const tabs = new BrowserTabs(syntheticBrowserContextWithNewPage(created.page, login.page));

  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, observePageAccess),
  );

  expect(login.navigationCount).toBe(noNavigations);
  expect(login.url).toBe("https://www.yupao.com/web/verify/");
  expect(created.navigationCount).toBe(firstNavigationCount);
  expect(result).toMatchObject({ id: 2, outcome: "handoff-ready" });
});

test("records authentication observed after navigating to prepare login", async () => {
  await using scope = createScope();
  const existing = syntheticLoginPage("https://www.yupao.com/");
  const created = syntheticLoginPage("about:blank", {
    snapshotElements: [],
    snapshotText: (state) =>
      state.navigationCount === noNavigations
        ? "Synthetic public recruiting page"
        : syntheticYupaoAuthenticatedText,
  });
  const context = syntheticBrowserContextWithNewPage(created.page, existing.page);
  const observer = new PlatformAccessObserver(context);
  const tabs = new BrowserTabs(context);

  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, (page) => observer.observePage(page)),
  );

  expect(existing.navigationCount).toBe(noNavigations);
  expect(created.navigationCount).toBe(firstNavigationCount);
  expect(result).toMatchObject({ outcome: "already-authenticated", platformId: "yupao" });
  expect(observer.observations).toEqual([
    expect.objectContaining({ authenticationState: "authenticated", platformId: "yupao" }),
  ]);
});

test("rejects a blank login route instead of handing off an unusable page", async () => {
  const fake = syntheticLoginPage("about:blank", {
    snapshotElements: [],
    snapshotText: "",
  });
  const tabs = new BrowserTabs(syntheticBrowserContext(fake.page));

  const failure = await run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, observePageAccess),
  ).catch((error: unknown) => error);
  expect(deepestFailureMessage(failure)).toMatch(/鱼泡直聘登录交接尚未就绪/u);
});

test("rejects a login handoff when the platform leaves its login page after navigation", async () => {
  const fake = syntheticLoginPage("about:blank", {
    afterNavigation: (state) => {
      setTimeout(() => {
        state.url = "https://www.yupao.com/a2/?ignored=sensitive";
      }, immediateRedirectDelayMilliseconds);
    },
  });
  const tabs = new BrowserTabs(syntheticBrowserContext(fake.page));

  const failure = await run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, observePageAccess),
  ).catch((error: unknown) => error);
  const failureMessage = deepestFailureMessage(failure);
  expect(failureMessage).toContain("https://www.yupao.com/a2/");
  expect(failureMessage).not.toContain("ignored=sensitive");
});
