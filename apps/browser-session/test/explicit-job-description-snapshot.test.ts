import type { BrowserContext, Page } from "patchright";
import type { JobDescriptionObservation } from "@job-boardwalk/contracts";
import { createScope, run } from "@shajara/host";
import { expect, test } from "vitest";

import { BackgroundCollectionControl } from "#/browser/background-collection-control.js";
import { BrowserTabs } from "#/browser/browser-tabs.js";
import { BrowserToolExecutor } from "#/browser/tool-executor.js";
import type { BrowserToolExecutorCoordination } from "#/browser/tool-executor.js";

function fakeBossJobDetailContext(): BrowserContext {
  const url = "https://www.zhipin.com/job_detail/synthetic-detail.html";
  const page = {
    evaluate: () =>
      Promise.resolve({
        accessElements: [],
        accessText: "",
        company: "示例科技甲",
        description: "工作职责\n建设合成测试平台。",
        details: ["TypeScript"],
        title: "平台工程师",
        truncated: false,
        url,
      }),
    isClosed: () => false,
    once: () => page,
    url: () => url,
  } as unknown as Page;
  const context = {
    on: () => context,
    pages: () => [page],
  } as unknown as BrowserContext;
  return context;
}

function jobDescriptionExecutor(
  writeJobDescriptionObservation: BrowserToolExecutorCoordination["writeJobDescriptionObservation"],
): BrowserToolExecutor {
  return new BrowserToolExecutor(
    new BrowserTabs(fakeBossJobDetailContext()),
    () => null,
    new BackgroundCollectionControl(),
    {
      recordReturnedControl: () => null,
      synchronizeJobEngagement: () => expect.unreachable("此测试不应同步岗位跟进"),
      writeJobDescriptionObservation,
    },
  );
}

test("submits the explicit job-description observation before returning it", async () => {
  const submitted: JobDescriptionObservation[] = [];
  const executor = jobDescriptionExecutor(function* writeJobDescriptionObservation(observation) {
    yield* [];
    submitted.push(observation);
  });
  await using scope = createScope();

  const result = (await scope.run(() =>
    executor.execute("browser_job_description_snapshot", {}),
  )) as JobDescriptionObservation & { tabId: number };
  const { tabId: _tabId, ...returnedObservation } = result;

  expect(submitted).toEqual([returnedObservation]);
});

test("fails instead of returning an unpreserved job-description observation", async () => {
  const rejection = new Error("Workspace Service 拒绝岗位观察：HTTP 503");
  let writeAttempted = false;
  const executor = jobDescriptionExecutor(function* writeJobDescriptionObservation() {
    yield* [];
    writeAttempted = true;
    throw rejection;
  });

  await expect(
    run(() => executor.execute("browser_job_description_snapshot", {})),
  ).rejects.toThrow();
  expect(writeAttempted).toBe(true);
});
