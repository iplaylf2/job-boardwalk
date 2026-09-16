// oxlint-disable max-lines -- Validate automatic interruption and login handoff through the shared control owner.
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
import { syntheticLoginPage, syntheticBrowserContext } from "./synthetic-login-handoff.js";
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

test("verification pauses all tools and re-pauses an unsuccessful returned-control snapshot", async () => {
  const control = new BackgroundCollectionControl();
  let text = "Access Verification\nPlease slide to verify";
  const fake = syntheticLoginPage("https://jobs.51job.com/synthetic-city/900000001.html", {
    snapshotText: () => text,
  });
  const context = syntheticBrowserContext(fake.page);
  const observer = new PlatformAccessObserver(context, (observation) =>
    control.observeAccess(observation),
  );
  const executor = new BrowserToolExecutor(
    new BrowserTabs(context),
    (page) => observer.observePage(page),
    control,
    {
      recordReturnedControl: () => null,
      synchronizeJobEngagement: () => expect.unreachable("must not synchronize"),
      writeJobDescriptionObservation: () => expect.unreachable("must not persist"),
    },
  );
  await using scope = createScope();
  const snapshot = await scope.run(() => executor.execute("browser_snapshot", {}));
  expect(snapshot).toMatchObject({
    controlState: "user-handoff",
    platformAccessObservation: { interruption: "verification-required" },
  });
  for (const [tool, input] of [
    ["browser_navigate", { url: "https://www.yupao.com/" }],
    ["browser_tabs", { action: "close", tabId: 1 }],
    ["browser_tabs", { action: "list" }],
    ["browser_snapshot", {}],
    ["browser_click", { ref: "e1" }],
    ["browser_job_card_snapshot", {}],
    ["browser_job_description_snapshot", {}],
    ["browser_sync_job_engagement", { engagement: "applied", platformId: "51job" }],
  ] as const) {
    // eslint-disable-next-line no-await-in-loop -- Each attempt observes the same paused session in sequence.
    const failure = await scope.run(function* rejectedTool() {
      try {
        yield* executor.execute(tool, input);
      } catch (error) {
        return error;
      }
      return null;
    });
    expect(failure).toMatchObject({ failure: { code: "user-control-active" } });
  }
  expect(
    await scope.run(() =>
      control.runCollection(() => recordedCollection(() => expect.unreachable())),
    ),
  ).toEqual({ started: false });
  expect(
    await scope.run(() => executor.execute("browser_snapshot", { userReturnedControl: true })),
  ).toMatchObject({ controlState: "user-handoff" });
  text = "合成岗位正文";
  expect(
    await scope.run(() => executor.execute("browser_snapshot", { userReturnedControl: true })),
  ).toMatchObject({ controlState: "active", platformAccessObservation: null });
  await scope.run(() => executor.execute("browser_navigate", { url: "https://www.51job.com/" }));
  expect(fake.navigationCount).toBe(oneCollection);
});

test("a passive verification read stops the batch before the next tab", async () => {
  const control = new BackgroundCollectionControl();
  const url = "https://jobs.51job.com/synthetic-city/900000001.html";
  const challenge = {
    evaluate: () =>
      Promise.resolve({
        accessElements: [],
        accessText: "Access Verification\nPlease slide to verify",
        description: "",
        title: "",
        url,
      }),
    url: () => url,
  } as unknown as Page;
  const nextPage = {
    evaluate: () => expect.unreachable("must not read the next tab after verification"),
    url: () => "https://www.yupao.com/zhaogong/900000002.html",
  } as unknown as Page;
  const context = syntheticBrowserContext(challenge, nextPage);
  const observer = new PlatformAccessObserver(context, (observation) =>
    control.observeAccess(observation),
  );
  const collector = new PassiveJobObservationCollector(
    context,
    {
      writeCardObservation: () => expect.unreachable("must not save a challenge"),
      writeDescriptionObservation: () => expect.unreachable("must not save a challenge"),
    },
    {
      collectionControl: control,
      observePageAccess: (facts) => {
        observer.observePage(facts);
        control.assertAgentControl();
      },
    },
  );
  await using scope = createScope();
  await scope.run(() => collector.collect(() => null));
  expect(control.state).toBe("user-handoff");
  expect(observer.observations).toEqual([
    expect.objectContaining({ interruption: "verification-required", url }),
  ]);
});
