import type { BrowserContext, Page } from "patchright";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { BackgroundCollectionControl } from "#/browser/background-collection-control.js";
import { JobEngagementCollector } from "#/browser/job-engagement/collector.js";
import { maximumJobsPerEngagementScan } from "#/browser/job-engagement/scan-limit.js";
import type { JobEngagementWriter } from "#/workspace-service/job-engagement-writer.js";

const firstPage = 1;
const jobsPerPage = 31;
const callsToReachLimit = 2;
const jobsBeyondLimit = 15;
const initialRecoveryRevision = 0;
const laterPageNumber = 3;
const paginatedScanTestTimeoutMilliseconds = 10_000;
const contactedPageOneUrl = "https://www.zhipin.com/web/geek/recommend?tab=1&sub=1&page=1&tag=4";

interface WrittenSnapshot {
  complete: boolean;
  jobCount: number;
  sourceUrl: string;
}

function pageFixture(
  initialUrl: string,
  metadata: (url: string) => unknown,
): { context: BrowserContext; navigations: string[] } {
  let currentUrl = initialUrl;
  const navigations: string[] = [];
  const page = {
    evaluate: () => Promise.resolve(metadata(currentUrl)),
    goto: (targetUrl: string) => {
      navigations.push(targetUrl);
      currentUrl = targetUrl;
      return Promise.resolve(null);
    },
    url: () => currentUrl,
  } as unknown as Page;
  return {
    context: { pages: () => [page] } as unknown as BrowserContext,
    navigations,
  };
}

function collectorFixture(context: BrowserContext): {
  collector: JobEngagementCollector;
  snapshots: WrittenSnapshot[];
} {
  const snapshots: WrittenSnapshot[] = [];
  const writer = {
    *write(snapshot) {
      snapshots.push({
        complete: snapshot.complete,
        jobCount: snapshot.jobs.length,
        sourceUrl: snapshot.sourceUrl,
      });
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
  const collector = new JobEngagementCollector(context, writer, () => initialRecoveryRevision, {
    collectionControl: new BackgroundCollectionControl(),
    observePageAccess: () => null,
    *selectPage() {
      yield* [];
    },
  });
  return { collector, snapshots };
}

test(
  "applies the shared engagement quantity policy across paginated pages",
  async () => {
    const { context, navigations } = pageFixture(contactedPageOneUrl, (url) => {
      const page = new URL(url).searchParams.get("page") ?? String(firstPage);
      return {
        jobs: Array.from({ length: jobsPerPage }, (_, index) => {
          const externalJobId = `contacted-${page}-${String(index)}`;
          return {
            details: [],
            externalJobId,
            jobUrl: `https://www.zhipin.com/job_detail/${externalJobId}.html`,
            summary: `后端开发 ${page}-${String(index)}`,
            title: `后端开发 ${page}-${String(index)}`,
          };
        }),
        text: "累计沟通职位数量 100",
        truncated: false,
        url,
      };
    });
    const { collector, snapshots } = collectorFixture(context);
    await using scope = createScope();

    await scope.run(() => collector.synchronize("boss", "contacted"));
    await scope.run(() => collector.synchronize("boss", "contacted"));

    expect(snapshots.at(-firstPage)).toEqual({
      complete: false,
      jobCount: maximumJobsPerEngagementScan,
      sourceUrl: contactedPageOneUrl,
    });
    expect(navigations).toHaveLength(callsToReachLimit - firstPage);

    await scope.run(() => collector.synchronize("boss", "contacted"));

    expect(navigations.at(-firstPage)).toBe(contactedPageOneUrl);
  },
  paginatedScanTestTimeoutMilliseconds,
);

test("applies the shared engagement quantity policy to a single-page platform", async () => {
  const yupaoUrl = "https://www.yupao.com/user/resume-info/?tab=4&subTab=1&mode=1";
  const visibleTotal = maximumJobsPerEngagementScan + jobsBeyondLimit;
  const { context } = pageFixture(yupaoUrl, (url) => ({
    cards: Array.from({ length: visibleTotal }, (_, index) => ({
      details: [],
      jobUrl: `https://www.yupao.com/zhaogong/${String(index + firstPage)}.html`,
      summary: `示例岗位 ${String(index)}`,
      title: `示例岗位 ${String(index)}`,
    })),
    text: `感兴趣${String(visibleTotal)}`,
    truncated: false,
    url,
  }));
  const { collector, snapshots } = collectorFixture(context);
  await using scope = createScope();

  await scope.run(() => collector.synchronize("yupao", "interested"));

  expect(snapshots).toEqual([
    {
      complete: false,
      jobCount: maximumJobsPerEngagementScan,
      sourceUrl: yupaoUrl,
    },
  ]);
});

test("continues a paginated scan past an overlapping page", async () => {
  const { context, navigations } = pageFixture(contactedPageOneUrl, (url) => {
    const page = Number(new URL(url).searchParams.get("page") ?? String(firstPage));
    const externalJobId = page < laterPageNumber ? "overlapping-job" : "later-job";
    return {
      jobs: [
        {
          details: [],
          externalJobId,
          jobUrl: `https://www.zhipin.com/job_detail/${externalJobId}.html`,
          summary: `合成岗位 ${externalJobId}`,
          title: `合成岗位 ${externalJobId}`,
        },
      ],
      text: "累计沟通职位数量 2",
      truncated: false,
      url,
    };
  });
  const { collector, snapshots } = collectorFixture(context);
  await using scope = createScope();

  await scope.run(() => collector.synchronize("boss", "contacted"));
  await scope.run(() => collector.synchronize("boss", "contacted"));
  await scope.run(() => collector.synchronize("boss", "contacted"));

  expect(snapshots.at(-firstPage)).toEqual({
    complete: true,
    jobCount: 2,
    sourceUrl: contactedPageOneUrl,
  });
  expect(navigations).toEqual([
    "https://www.zhipin.com/web/geek/recommend?tab=1&sub=1&page=2&tag=4",
    "https://www.zhipin.com/web/geek/recommend?tab=1&sub=1&page=3&tag=4",
  ]);
});
