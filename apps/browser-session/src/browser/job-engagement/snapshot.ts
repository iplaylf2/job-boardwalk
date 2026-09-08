import type { Page } from "patchright";
import type { RiteCoroutine } from "@shajara/host";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import type {
  JobEngagementEvidence,
  JobEngagementKind,
  JobEngagementSnapshot,
} from "@job-boardwalk/contracts";

import { extractExternalJobId } from "#/browser/platform-job-links.js";
import type { PageAccessFacts } from "#/browser/platforms/types.js";

import { jobEngagementPlatformAdapters, matchJobEngagementPage } from "./platform-adapters.js";
import type { JobEngagementPageMetadata } from "./types.js";

const emptyCollectionLength = 0;

export interface CapturedJobEngagementSnapshot extends JobEngagementSnapshot {
  readonly completionTotal: number | null;
}

function jobsWithExternalIds(
  platformId: PlatformId,
  jobs: JobEngagementEvidence[],
): JobEngagementEvidence[] {
  return jobs.map((job) => {
    const externalJobId = job.jobUrl ? extractExternalJobId(platformId, job.jobUrl) : null;
    return externalJobId ? { ...job, externalJobId } : job;
  });
}

export function jobEngagementSnapshotFromPageMetadata(
  metadata: JobEngagementPageMetadata,
  capturedAt: string,
  engagement: JobEngagementKind,
  platformId: PlatformId,
): CapturedJobEngagementSnapshot {
  const jobs = jobsWithExternalIds(platformId, metadata.jobs);
  const adapter = jobEngagementPlatformAdapters[platformId];
  const visibleTotal = adapter.readTotal(metadata.text, engagement);
  const isInitialTarget = adapter.matchesTarget(adapter.initialTarget(engagement), metadata.url);
  if (jobs.length === emptyCollectionLength && isInitialTarget) {
    if (visibleTotal === null) {
      throw new Error("岗位跟进分类页未提供总数，也未识别到岗位卡片，无法确认列表为空。");
    }
    if (visibleTotal > emptyCollectionLength) {
      throw new Error(`岗位跟进分类页显示 ${String(visibleTotal)} 个岗位，但未识别到岗位卡片。`);
    }
  }
  const hasCompleteEvidence = visibleTotal !== null && !metadata.truncated;
  return {
    capturedAt,
    complete: hasCompleteEvidence && jobs.length === visibleTotal,
    completionTotal: hasCompleteEvidence ? visibleTotal : null,
    engagement,
    jobs,
    platformId,
    sourceUrl: metadata.url,
    total: visibleTotal ?? jobs.length,
  };
}

export function* captureJobEngagementSnapshot(
  page: Page,
  observePageAccess?: (page: PageAccessFacts) => void,
): RiteCoroutine<CapturedJobEngagementSnapshot> {
  const initialUrl = page.url();
  const match = matchJobEngagementPage(initialUrl);
  if (!match) {
    throw new Error("当前页面不是受支持的岗位跟进分类页。");
  }
  const metadata = yield* match.adapter.capturePage(page);
  if (page.url() !== initialUrl || metadata.url !== initialUrl) {
    throw new Error("岗位跟进分类页在读取期间发生了导航；请等待页面稳定后重试。");
  }
  observePageAccess?.({ elements: [], text: metadata.text, url: metadata.url });
  return jobEngagementSnapshotFromPageMetadata(
    metadata,
    new Date().toISOString(),
    match.engagement,
    match.adapter.platformId,
  );
}
