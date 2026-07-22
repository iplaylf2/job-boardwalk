import type { Page } from "patchright";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { parsePlatformJobEngagementUrl } from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import type {
  JobEngagementEvidence,
  JobEngagementKind,
  JobEngagementSnapshot,
} from "@job-boardwalk/contracts";

import { extractExternalJobId } from "#/browser/platform-job-links.js";
import { requireRecruitingPlatformAdapter } from "#/browser/recruiting-platform-adapters.js";
import type { PageAccessFacts } from "#/browser/recruiting-platform-adapters.js";

import { captureBossJobEngagementMetadata } from "./boss-snapshot.js";
import { captureYupaoJobEngagementMetadata } from "./yupao-snapshot.js";
import type { YupaoJobEngagementMetadata } from "./yupao-snapshot.js";

const emptyCollectionLength = 0;
const firstPage = 1;

export interface CapturedJobEngagementSnapshot extends JobEngagementSnapshot {
  readonly completionTotal: number | null;
}

interface JobEngagementPageMetadata {
  jobs: JobEngagementEvidence[];
  text: string;
  truncated: boolean;
  url: string;
}

export function visibleJobEngagementCount(
  text: string,
  engagement: JobEngagementKind,
): number | null {
  const patterns = {
    applied: /累计投递简历数量\s*(?<total>\d+)/u,
    contacted: /累计沟通职位数量\s*(?<total>\d+)/u,
    interested: /(?:^|\s)感兴趣\s*(?<total>\d+)(?:\s|$)/u,
    interviewed: /(?:^|\s)面试\s*(?<total>\d+)(?:\s|$)/u,
  } as const;
  const match = patterns[engagement].exec(text);
  return match?.groups?.["total"] ? Number(match.groups["total"]) : null;
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

function yupaoPageMetadata(metadata: YupaoJobEngagementMetadata): JobEngagementPageMetadata {
  return {
    jobs: metadata.cards,
    text: metadata.text,
    truncated: metadata.truncated,
    url: metadata.url,
  };
}

export function jobEngagementSnapshotFromYupaoMetadata(
  metadata: YupaoJobEngagementMetadata,
  capturedAt: string,
  engagement: JobEngagementKind,
): CapturedJobEngagementSnapshot {
  return jobEngagementSnapshotFromPageMetadata(
    yupaoPageMetadata(metadata),
    capturedAt,
    engagement,
    "yupao",
  );
}

function isFirstEngagementPage(url: string): boolean {
  const page = Number(new URL(url).searchParams.get("page") ?? firstPage);
  return page === firstPage;
}

function jobEngagementSnapshotFromPageMetadata(
  metadata: JobEngagementPageMetadata,
  capturedAt: string,
  engagement: JobEngagementKind,
  platformId: PlatformId,
): CapturedJobEngagementSnapshot {
  const jobs = jobsWithExternalIds(platformId, metadata.jobs);
  const visibleTotal = visibleJobEngagementCount(metadata.text, engagement);
  if (jobs.length === emptyCollectionLength && isFirstEngagementPage(metadata.url)) {
    if (visibleTotal === null) {
      throw new Error("个人中心未提供岗位总数，也未识别到岗位卡片，无法确认列表为空。");
    }
    if (visibleTotal > emptyCollectionLength) {
      throw new Error(`个人中心显示 ${String(visibleTotal)} 个岗位，但未识别到岗位卡片。`);
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
  const { platformId } = requireRecruitingPlatformAdapter(initialUrl);
  const engagement = parsePlatformJobEngagementUrl(platformId, initialUrl);
  if (!engagement) {
    throw new Error("当前页面不是招聘平台个人中心的岗位跟进列表。");
  }
  const metadata =
    platformId === "boss"
      ? yield* until(() => page.evaluate(captureBossJobEngagementMetadata))
      : yupaoPageMetadata(yield* until(() => page.evaluate(captureYupaoJobEngagementMetadata)));
  if (page.url() !== initialUrl || metadata.url !== initialUrl) {
    throw new Error("个人中心岗位跟进列表在读取期间发生了导航。");
  }
  observePageAccess?.({ elements: [], text: metadata.text, url: metadata.url });
  return jobEngagementSnapshotFromPageMetadata(
    metadata,
    new Date().toISOString(),
    engagement,
    platformId,
  );
}
