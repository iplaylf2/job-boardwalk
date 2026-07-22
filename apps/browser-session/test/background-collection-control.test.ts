import type { BrowserContext, Page } from "patchright";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import { createScope, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { expect, test } from "vitest";

import { BackgroundCollectionControl } from "#/browser/background-collection-control.js";
import { BrowserTabs } from "#/browser/browser-tabs.js";
import { PassiveJobCollector } from "#/browser/passive-job-collector.js";
import { BrowserToolExecutor } from "#/browser/tool-executor.js";
import type { JobPostingWriter } from "#/workspace-service/job-posting-writer.js";

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

function fakeLoginContext(navigationError?: Error): BrowserContext {
  let url = "https://www.zhipin.com/";
  const page = {
    bringToFront: () => Promise.resolve(),
    evaluate: () =>
      Promise.resolve({
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
        elements: [],
        text: "登录",
        title: "BOSS直聘",
        truncated: false,
        url,
        viewport: { height: 900, scrollY: 0, width: 1200 },
      }),
    goto: (targetUrl: string) => {
      if (navigationError) {
        return Promise.reject(navigationError);
      }
      url = targetUrl;
      return Promise.resolve(null);
    },
    isClosed: () => false,
    locator: () => ({ nth: () => null }),
    once: () => page,
    title: () => Promise.resolve("BOSS直聘"),
    url: () => url,
  } as unknown as Page;
  const context = {
    on: () => context,
    pages: () => [page],
  } as unknown as BrowserContext;
  return context;
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
    },
  );
  let collectionCount = noCollections;
  const failingScope = createScope();

  await expect(
    failingScope.run(() => executor.execute("browser_prepare_login", { platformId: "boss" })),
  ).rejects.toThrow();
  await expect(failingScope[Symbol.asyncDispose]()).rejects.toThrow();
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
    *write() {
      persistenceStarted = true;
      yield* until(() => persistence.promise);
    },
  } satisfies JobPostingWriter;
  const collector = new PassiveJobCollector(fakeLoginContext(), writer, {
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
