import { savedDescription } from "./synthetic-description-write.js";
import type { BrowserContext, Page } from "patchright";
import type {
  JobDescriptionObservation,
  WorkspaceChangeAttribution,
} from "@job-boardwalk/contracts";
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
        recruitmentClosure: "职位已关闭",
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
  const submitted: {
    attribution: WorkspaceChangeAttribution;
    observation: JobDescriptionObservation;
    sourceId?: number;
  }[] = [];
  const executor = jobDescriptionExecutor(
    function* writeJobDescriptionObservation(observation, attribution, sourceId) {
      yield* [];
      submitted.push({ attribution, observation, ...(sourceId ? { sourceId } : {}) });
      return savedDescription(observation, "source-updated", sourceId);
    },
  );
  await using scope = createScope();

  const result = (await scope.run(() =>
    executor.execute("browser_job_description_snapshot", { sourceId: 71 }),
  )) as JobDescriptionObservation & {
    persistence: { outcome: string };
    sourceBinding: { outcome: string; sourceId: number };
    tabId: number;
  };
  const { persistence, sourceBinding, tabId: _tabId, ...returnedObservation } = result;
  expect(result).toMatchObject({
    recruitment: {
      evidence: "职位已关闭",
      observedAt: result.observedAt,
      state: "closed",
      url: result.jobUrl,
    },
  });
  expect(persistence).toMatchObject({
    jobId: 1,
    outcome: "source-updated",
    sources: [{ current: true, engagements: [], sourceId: 71 }],
  });
  expect(persistence).not.toHaveProperty("job");
  expect(sourceBinding).toEqual({ outcome: "bound", sourceId: 71 });

  expect(submitted).toEqual([
    {
      attribution: {
        initiatedBy: "agent",
        reason: "Agent 显式采集当前页面的岗位详情观察",
      },
      observation: returnedObservation,
      sourceId: 71,
    },
  ]);
});

test("fails when Workspace Service rejects the job-description observation", async () => {
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

test("fails when Workspace Service accepts but does not apply a stale observation", async () => {
  const executor = jobDescriptionExecutor(function* writeJobDescriptionObservation(observation) {
    yield* [];
    return savedDescription(observation, "stale");
  });

  await expect(
    run(() => executor.execute("browser_job_description_snapshot", {})),
  ).rejects.toThrow();
});

test("makes an unrequested list-source binding explicit after a retained detail read", async () => {
  const executor = jobDescriptionExecutor(function* writeJobDescriptionObservation(observation) {
    yield* [];
    return savedDescription(observation, "created");
  });
  const result = await run(() => executor.execute("browser_job_description_snapshot", {}));
  expect(result).toMatchObject({ sourceBinding: { outcome: "not-requested" } });
});

test("preserves all source summaries and identifies the current source within its platform", async () => {
  const historicalTime = "2026-08-01T00:00:00.000Z";
  const executor = jobDescriptionExecutor(function* writeJobDescriptionObservation(observation) {
    yield* [];
    const result = savedDescription(observation, "source-updated");
    const [current] = result.job.sources;
    if (!current) {
      throw new Error("missing synthetic source");
    }
    result.job.sources.push(
      {
        ...current,
        engagements: [
          { firstObservedAt: historicalTime, kind: "contacted", lastObservedAt: historicalTime },
        ],
        externalJobId: "synthetic-repost",
        id: 72,
        jobUrl: "https://www.zhipin.com/job_detail/synthetic-repost.html",
      },
      {
        ...current,
        engagements: [
          { firstObservedAt: historicalTime, kind: "applied", lastObservedAt: historicalTime },
        ],
        id: 73,
        jobUrl: "https://www.yupao.com/zhaogong/900000001.html",
        platformId: "yupao",
      },
    );
    return result;
  });
  const result = await run(() => executor.execute("browser_job_description_snapshot", {}));
  expect(result).toMatchObject({
    persistence: {
      sources: [
        { current: true, engagements: [], sourceId: 71 },
        {
          current: false,
          engagements: [
            { firstObservedAt: historicalTime, kind: "contacted", lastObservedAt: historicalTime },
          ],
          sourceId: 72,
        },
        {
          current: false,
          engagements: [
            { firstObservedAt: historicalTime, kind: "applied", lastObservedAt: historicalTime },
          ],
          platformId: "yupao",
          sourceId: 73,
        },
      ],
    },
  });
  expect(result).not.toHaveProperty("persistence.job");
});
