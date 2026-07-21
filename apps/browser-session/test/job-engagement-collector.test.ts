import type { BrowserContext, Page } from "patchright";
import { platformIds } from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { BackgroundCollectionControl } from "#/browser/background-collection-control.js";
import { JobEngagementCollector } from "#/browser/job-engagement/collector.js";
import type { JobEngagementWriter } from "#/workspace-service/job-engagement-writer.js";

const onePage = 1;
const initialAndRecoveryNavigationCount = 2;
const initialRecoveryRevision = 0;

function jobEngagementCollector(
  context: BrowserContext,
  writer: JobEngagementWriter,
  recoveryRevision: (platformId: PlatformId) => number,
): JobEngagementCollector {
  return new JobEngagementCollector(context, writer, recoveryRevision, {
    collectionControl: new BackgroundCollectionControl(),
    observePageAccess: () => null,
  });
}

test("does not replace managed engagement pages after their targets redirect to login", async () => {
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
  await using scope = createScope();

  await scope.run(() => collector.collect(() => null));
  await scope.run(() => collector.collect(() => null));

  expect(newPageCount).toBe(platformIds.length);
  expect(navigationCount).toBe(platformIds.length);

  recoveryRevisions.set("boss", onePage);
  await scope.run(() => collector.collect(() => null));

  expect(newPageCount).toBe(platformIds.length);
  expect(navigationCount).toBe(platformIds.length + onePage);

  recoveryRevisions.set("yupao", onePage);
  await scope.run(() => collector.collect(() => null));

  expect(newPageCount).toBe(platformIds.length);
  expect(navigationCount).toBe(platformIds.length * initialAndRecoveryNavigationCount);
});

test("contains a page-opening failure and keeps supervision alive", async () => {
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
  const collector = jobEngagementCollector(context, writer, () => initialRecoveryRevision);
  const errors: Error[] = [];
  const scope = createScope();
  const supervision = scope.run(() => collector.run((error) => errors.push(error)));
  let settled = false;
  const settlement = supervision
    .finally(() => {
      settled = true;
    })
    .catch(() => null);

  await expect.poll(() => errors).toEqual(platformIds.map(() => navigationError));
  expect(settled).toBe(false);

  await scope[Symbol.asyncDispose]();
  await expect(supervision).rejects.toThrow();
  await settlement;
});
