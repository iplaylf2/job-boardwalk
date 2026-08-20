import type { BrowserContext, Page } from "patchright";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import { createScope, run, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { expect, test } from "vitest";

import { BackgroundCollectionControl } from "#/browser/background-collection-control.js";
import { BrowserTabs } from "#/browser/browser-tabs.js";
import { PlatformAccessObserver } from "#/browser/platform-access-observer.js";
import { PassiveJobObservationCollector } from "#/browser/job-observation/passive-collector.js";
import { BrowserToolExecutor } from "#/browser/tool-executor.js";
import type { JobObservationWriter } from "#/workspace-service/job-observation-writer.js";
import { createSyntheticPageLocator } from "./synthetic-page-locator.js";

const noCollections = 0;
const oneCollection = 1;

function* blockedCollection(
  blocker: Promise<unknown>,
  recordStart: () => void,
): RiteCoroutine<void> {
  recordStart();
  yield* until(() => blocker);
}

function* recordedCollection(recordCollection: () => void): RiteCoroutine<void> {
  yield* [];
  recordCollection();
}

function fakeLoginPage(initialUrl: string, navigationError?: Error): Page {
  let url = initialUrl;
  function snapshot() {
    return Promise.resolve({
      accessElements: [],
      accessText: "登录",
      cards: [
        {
          details: [],
          href: "https://www.zhipin.com/job_detail/example.html",
          text: "后端开发",
          title: "后端开发",
        },
      ],
      documentReadyState: "complete",
      elements: [
        {
          disabled: false,
          name: "Synthetic login control",
          role: "button",
          signature: "synthetic-login-control",
          sourceIndex: 0,
        },
      ],
      text: "登录",
      title: "BOSS直聘",
      truncated: false,
      url,
      viewport: { height: 900, scrollY: 0, width: 1200 },
    });
  }
  return {
    bringToFront: () => Promise.resolve(),
    evaluate: snapshot,
    goto: (targetUrl: string) => {
      if (navigationError) {
        return Promise.reject(navigationError);
      }
      url = targetUrl;
      return Promise.resolve(null);
    },
    isClosed: () => false,
    locator: createSyntheticPageLocator({
      nth: () => null,
      readSnapshot: snapshot,
      title: "BOSS直聘",
    }),
    once: () => null,
    title: () => Promise.resolve("BOSS直聘"),
    url: () => url,
  } as unknown as Page;
}

function fakeLoginContext(navigationError?: Error): BrowserContext {
  const existingPage = fakeLoginPage("https://www.zhipin.com/web/geek/jobs");
  return {
    newPage: () => Promise.resolve(fakeLoginPage("about:blank", navigationError)),
    on: () => null,
    pages: () => [existingPage],
  } as unknown as BrowserContext;
}

function fakeAuthenticatedYupaoContext(): BrowserContext {
  const url = "https://www.yupao.com/a2/";
  function snapshot() {
    return Promise.resolve({
      documentReadyState: "complete",
      elements: [],
      text: ["首页", "职位", "公司", "校园", "消息", "简历", "合成求职者"].join("\n"),
      title: "Synthetic Yupao jobs",
      truncated: false,
      url,
      viewport: { height: 900, scrollY: 0, width: 1200 },
    });
  }
  const page = {
    bringToFront: () => Promise.resolve(),
    evaluate: snapshot,
    isClosed: () => false,
    locator: createSyntheticPageLocator({
      nth: () => null,
      readSnapshot: snapshot,
      title: "Synthetic Yupao jobs",
    }),
    once: () => page,
    title: () => Promise.resolve("Synthetic Yupao jobs"),
    url: () => url,
  } as unknown as Page;
  return {
    on: () => null,
    pages: () => [page],
  } as unknown as BrowserContext;
}

test("quiesces active work and blocks collection until control returns", async () => {
  const control = new BackgroundCollectionControl();
  const blocker = Promise.withResolvers<true>();
  let collectionStarted = false;
  let laterCollectionCount = noCollections;
  await using scope = createScope();
  const activeCollection = scope.run(() =>
    control.runCollection(() =>
      blockedCollection(blocker.promise, () => {
        collectionStarted = true;
      }),
    ),
  );
  await expect.poll(() => collectionStarted).toBe(true);

  const pause = scope.run(() => control.pauseForUserHandoff());
  expect(await Promise.race([pause.then(() => "settled"), Promise.resolve("pending")])).toBe(
    "pending",
  );
  blocker.resolve(true);
  await activeCollection;
  await pause;
  control.completeUserHandoff();
  await scope.run(() =>
    control.runCollection(() =>
      recordedCollection(() => {
        laterCollectionCount += oneCollection;
      }),
    ),
  );
  expect(laterCollectionCount).toBe(noCollections);

  expect(control.returnControl()).toBe(true);
  await scope.run(() =>
    control.runCollection(() =>
      recordedCollection(() => {
        laterCollectionCount += oneCollection;
      }),
    ),
  );
  expect(laterCollectionCount).toBe(oneCollection);
});

test("connects login preparation and returned-control snapshots to the gate", async () => {
  const control = new BackgroundCollectionControl();
  const returnedControlPlatforms: PlatformId[] = [];
  const executor = new BrowserToolExecutor(
    new BrowserTabs(fakeLoginContext()),
    () => null,
    control,
    {
      recordReturnedControl: (platformId) => returnedControlPlatforms.push(platformId),
      synchronizeJobEngagement: () => expect.unreachable("此测试不应同步岗位跟进"),
      writeJobDescriptionObservation: () => expect.unreachable("此测试不应写入岗位详情"),
    },
  );
  let collectionCount = noCollections;
  await using scope = createScope();

  await scope.run(() => executor.execute("browser_prepare_login", { platformId: "boss" }));
  await scope.run(() =>
    control.runCollection(() =>
      recordedCollection(() => {
        collectionCount += oneCollection;
      }),
    ),
  );
  expect(collectionCount).toBe(noCollections);

  await scope.run(() => executor.execute("browser_snapshot", { userReturnedControl: true }));
  await scope.run(() =>
    control.runCollection(() =>
      recordedCollection(() => {
        collectionCount += oneCollection;
      }),
    ),
  );
  expect(collectionCount).toBe(oneCollection);
  expect(returnedControlPlatforms).toEqual(["boss"]);
});

test("keeps collection active when login preparation finds an authenticated page", async () => {
  const control = new BackgroundCollectionControl();
  const context = fakeAuthenticatedYupaoContext();
  const observer = new PlatformAccessObserver(context);
  const executor = new BrowserToolExecutor(
    new BrowserTabs(context),
    (page) => observer.observePage(page),
    control,
    {
      recordReturnedControl: () => expect.unreachable("此测试不应记录浏览器交还"),
      synchronizeJobEngagement: () => expect.unreachable("此测试不应同步岗位跟进"),
      writeJobDescriptionObservation: () => expect.unreachable("此测试不应写入岗位详情"),
    },
  );
  let collectionCount = noCollections;
  await using scope = createScope();

  const result = await scope.run(() =>
    executor.execute("browser_prepare_login", { platformId: "yupao" }),
  );
  await scope.run(() =>
    control.runCollection(() =>
      recordedCollection(() => {
        collectionCount += oneCollection;
      }),
    ),
  );

  expect(result).toMatchObject({ outcome: "already-authenticated" });
  expect(observer.observations).toHaveLength(oneCollection);
  expect(collectionCount).toBe(oneCollection);
});

test("reopens collection when login preparation fails", async () => {
  const control = new BackgroundCollectionControl();
  const navigationError = new Error("navigation failed");
  const executor = new BrowserToolExecutor(
    new BrowserTabs(fakeLoginContext(navigationError)),
    () => null,
    control,
    {
      recordReturnedControl: () => null,
      synchronizeJobEngagement: () => expect.unreachable("此测试不应同步岗位跟进"),
      writeJobDescriptionObservation: () => expect.unreachable("此测试不应写入岗位详情"),
    },
  );
  let collectionCount = noCollections;

  await expect(
    run(() => executor.execute("browser_prepare_login", { platformId: "boss" })),
  ).rejects.toThrow();
  await using collectionScope = createScope();
  await collectionScope.run(() =>
    control.runCollection(() =>
      recordedCollection(() => {
        collectionCount += oneCollection;
      }),
    ),
  );

  expect(collectionCount).toBe(oneCollection);
});

test("does not make workspace persistence delay browser handoff", async () => {
  const control = new BackgroundCollectionControl();
  const persistence = Promise.withResolvers<true>();
  let persistenceStarted = false;
  const writer = {
    *writeCardObservation() {
      persistenceStarted = true;
      yield* until(() => persistence.promise);
      return { outcome: "unchanged" };
    },
    *writeDescriptionObservation() {
      yield* [];
      return { outcome: "unchanged" };
    },
  } satisfies JobObservationWriter;
  const collector = new PassiveJobObservationCollector(fakeLoginContext(), writer, {
    collectionControl: control,
    observePageAccess: () => null,
  });
  await using scope = createScope();
  const collection = scope.run(() =>
    collector.collect((error) => expect.unreachable(error.message)),
  );
  await expect.poll(() => persistenceStarted).toBe(true);

  await scope.run(() => control.pauseForUserHandoff());
  control.completeUserHandoff();
  persistence.resolve(true);
  await collection;

  expect(control.returnControl()).toBe(true);
});
