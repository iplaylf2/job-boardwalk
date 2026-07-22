import type { BrowserContext, Page } from "patchright";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import { createScope } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { expect, test } from "vitest";

import { BackgroundCollectionControl } from "#/browser/background-collection-control.js";
import { JobEngagementCollector } from "#/browser/job-engagement/collector.js";
import type { JobEngagementWriter } from "#/workspace-service/job-engagement-writer.js";

const onePage = 1;
const initialAndRecoveryNavigationCount = 2;
const initialRecoveryRevision = 0;

function* ignorePageSelection(): RiteCoroutine<void> {
  yield* [];
}

function jobEngagementCollector(
  context: BrowserContext,
  writer: JobEngagementWriter,
  recoveryRevision: (platformId: PlatformId) => number,
  selectPage: (page: Page) => RiteCoroutine<void> = ignorePageSelection,
): JobEngagementCollector {
  return new JobEngagementCollector(context, writer, recoveryRevision, {
    collectionControl: new BackgroundCollectionControl(),
    observePageAccess: () => null,
    selectPage,
  });
}

async function expectRejectedSynchronization(
  collector: JobEngagementCollector,
  platformId: PlatformId,
  engagement: "contacted" | "applied",
): Promise<void> {
  const scope = createScope();
  await expect(scope.run(() => collector.synchronize(platformId, engagement))).rejects.toThrow();
  await expect(scope[Symbol.asyncDispose]()).rejects.toThrow();
}

test("does not retry redirected engagement pages without an explicit recovery handoff", async () => {
  const pages: Page[] = [];
  const recoveryRevisions = new Map<PlatformId, number>();
  let navigationCount = 0;
  let newPageCount = 0;
  const context = {
    newPage: () => {
      newPageCount += onePage;
      let url = "about:blank";
      const page = {
        goto: (targetUrl: string) => {
          navigationCount += onePage;
          url = targetUrl.includes("zhipin.com")
            ? "https://www.zhipin.com/web/user/"
            : "https://www.yupao.com/web/login/";
          return Promise.resolve(null);
        },
        url: () => url,
      } as unknown as Page;
      pages.push(page);
      return Promise.resolve(page);
    },
    pages: () => [...pages],
  } as unknown as BrowserContext;
  const writer = {
    *write() {
      yield* [];
      expect.unreachable("非岗位跟进列表页不应调用关系写入器");
    },
  } satisfies JobEngagementWriter;
  const collector = jobEngagementCollector(
    context,
    writer,
    (platformId) => recoveryRevisions.get(platformId) ?? initialRecoveryRevision,
  );
  await expectRejectedSynchronization(collector, "boss", "contacted");
  await expectRejectedSynchronization(collector, "yupao", "contacted");
  await expectRejectedSynchronization(collector, "boss", "contacted");

  expect(newPageCount).toBe(initialAndRecoveryNavigationCount);
  expect(navigationCount).toBe(initialAndRecoveryNavigationCount);

  recoveryRevisions.set("boss", onePage);
  await expectRejectedSynchronization(collector, "boss", "contacted");

  expect(newPageCount).toBe(initialAndRecoveryNavigationCount);
  expect(navigationCount).toBe(initialAndRecoveryNavigationCount + onePage);

  recoveryRevisions.set("yupao", onePage);
  await expectRejectedSynchronization(collector, "yupao", "contacted");

  expect(newPageCount).toBe(initialAndRecoveryNavigationCount);
  expect(navigationCount).toBe(
    initialAndRecoveryNavigationCount * initialAndRecoveryNavigationCount,
  );
});

test("surfaces a page-opening failure without scheduling a retry", async () => {
  const navigationError = new Error("navigation aborted");
  const context = {
    newPage: () =>
      Promise.resolve({
        goto: () => Promise.reject(navigationError),
        url: () => "about:blank",
      } as unknown as Page),
    pages: () => [],
  } as unknown as BrowserContext;
  const writer = {
    *write() {
      yield* [];
      expect.unreachable("导航失败时不应写入快照");
    },
  } satisfies JobEngagementWriter;
  const selectedPages: Page[] = [];
  const collector = jobEngagementCollector(
    context,
    writer,
    () => initialRecoveryRevision,
    function* selectPage(page) {
      yield* [];
      selectedPages.push(page);
    },
  );
  await expectRejectedSynchronization(collector, "boss", "contacted");
  expect(selectedPages).toHaveLength(onePage);
});

test("does not promote a fallback observed count into a complete engagement snapshot", async () => {
  const bossUrl = "https://www.zhipin.com/web/geek/recommend?tab=1&sub=1&page=1&tag=4";
  const bossPage = {
    evaluate: () =>
      Promise.resolve({
        jobs: [
          {
            details: [],
            externalJobId: "partial",
            jobUrl: "https://www.zhipin.com/job_detail/partial.html",
            summary: "后端开发",
            title: "后端开发",
          },
        ],
        text: "我的求职进展",
        truncated: false,
        url: bossUrl,
      }),
    title: () => Promise.resolve("BOSS直聘"),
    url: () => bossUrl,
  } as unknown as Page;
  const redirectedYupaoPage = {
    goto: () => Promise.resolve(null),
    url: () => "https://www.yupao.com/web/login/",
  } as unknown as Page;
  const context = {
    newPage: () => Promise.resolve(redirectedYupaoPage),
    pages: () => [bossPage],
  } as unknown as BrowserContext;
  const snapshots: unknown[] = [];
  const writer = {
    *write(snapshot) {
      snapshots.push(snapshot);
      yield* [];
      return {
        complete: snapshot.complete,
        engagement: snapshot.engagement,
        observed: snapshot.jobs.length,
        platformId: snapshot.platformId,
        removed: 0,
        synchronizedAt: snapshot.capturedAt,
      };
    },
  } satisfies JobEngagementWriter;
  const collector = jobEngagementCollector(context, writer, () => initialRecoveryRevision);
  await using scope = createScope();

  await scope.run(() => collector.synchronize("boss", "contacted"));

  expect(snapshots).toEqual([
    expect.objectContaining({ complete: false, engagement: "contacted", total: 1 }),
  ]);
});

test("surfaces uncertain first-page emptiness instead of advancing the scan", async () => {
  const bossUrl = "https://www.zhipin.com/web/geek/recommend?tab=1&sub=1&page=1&tag=4";
  let pageText = "累计沟通职位数量18";
  const bossPage = {
    evaluate: () =>
      Promise.resolve({
        jobs: [],
        text: pageText,
        truncated: false,
        url: bossUrl,
      }),
    url: () => bossUrl,
  } as unknown as Page;
  const redirectedYupaoPage = {
    goto: () => Promise.resolve(null),
    url: () => "https://www.yupao.com/web/login/",
  } as unknown as Page;
  const context = {
    newPage: () => Promise.resolve(redirectedYupaoPage),
    pages: () => [bossPage],
  } as unknown as BrowserContext;
  const writer = {
    *write() {
      yield* [];
      expect.unreachable("解析失败时不应写入空快照");
    },
  } satisfies JobEngagementWriter;
  const collector = jobEngagementCollector(context, writer, () => initialRecoveryRevision);
  await expectRejectedSynchronization(collector, "boss", "contacted");
  pageText = "我的求职进展";
  await expectRejectedSynchronization(collector, "boss", "contacted");
});

test("continues an explicitly requested paginated scan before another category", async () => {
  let bossUrl = "https://www.zhipin.com/web/geek/recommend?tab=1&sub=1&page=1&tag=4";
  const navigations: string[] = [];
  const pages: Page[] = [];
  const bossPage = {
    evaluate: () => {
      const page = new URL(bossUrl).searchParams.get("page") ?? "1";
      return Promise.resolve({
        jobs: [
          {
            details: [],
            externalJobId: `contacted-${page}`,
            jobUrl: `https://www.zhipin.com/job_detail/contacted-${page}.html`,
            summary: `后端开发 ${page}`,
            title: `后端开发 ${page}`,
          },
        ],
        text: bossUrl.includes("tab=1") ? "累计沟通职位数量 2" : "累计投递简历数量 1",
        truncated: false,
        url: bossUrl,
      });
    },
    goto: (targetUrl: string) => {
      navigations.push(targetUrl);
      bossUrl = targetUrl;
      return Promise.resolve(null);
    },
    title: () => Promise.resolve("BOSS直聘"),
    url: () => bossUrl,
  } as unknown as Page;
  const redirectedYupaoPage = {
    goto: () => Promise.resolve(null),
    url: () => "https://www.yupao.com/web/login/",
  } as unknown as Page;
  pages.push(bossPage);
  const context = {
    newPage: () => {
      pages.push(redirectedYupaoPage);
      return Promise.resolve(redirectedYupaoPage);
    },
    pages: () => [...pages],
  } as unknown as BrowserContext;
  const snapshots: { complete: boolean; engagement: string }[] = [];
  const writer = {
    *write(snapshot) {
      snapshots.push({ complete: snapshot.complete, engagement: snapshot.engagement });
      yield* [];
      return {
        complete: snapshot.complete,
        engagement: snapshot.engagement,
        observed: snapshot.jobs.length,
        platformId: snapshot.platformId,
        removed: 0,
        synchronizedAt: snapshot.capturedAt,
      };
    },
  } satisfies JobEngagementWriter;
  const collector = jobEngagementCollector(context, writer, () => initialRecoveryRevision);
  await using scope = createScope();

  await scope.run(() => collector.synchronize("boss", "contacted"));
  await scope.run(() => collector.synchronize("boss", "contacted"));

  expect(snapshots).toEqual([
    { complete: false, engagement: "contacted" },
    { complete: true, engagement: "contacted" },
  ]);
  expect(navigations).toEqual([
    "https://www.zhipin.com/web/geek/recommend?tab=1&sub=1&page=2&tag=4",
  ]);

  bossUrl = "https://www.zhipin.com/web/geek/recommend?tab=2&sub=1&page=1&tag=4";
  await scope.run(() => collector.synchronize("boss", "applied"));

  expect(snapshots.at(-onePage)).toEqual({ complete: true, engagement: "applied" });
});
