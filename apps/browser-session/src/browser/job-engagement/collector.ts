import type { BrowserContext, Page } from "patchright";
import type {
  JobEngagementEvidence,
  JobEngagementKind,
  JobEngagementSnapshot,
  SynchronizeJobEngagementResult,
} from "@job-boardwalk/contracts";
import type { PlatformId, PlatformJobEngagementKind } from "@job-boardwalk/platform-catalog";
import { sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

import type { JobEngagementWriter } from "#/workspace-service/job-engagement-writer.js";

import type { BackgroundCollectionControl } from "#/browser/background-collection-control.js";
import { ManagedPageTargets } from "#/browser/managed-page-targets.js";
import type { PageAccessFacts } from "#/browser/recruiting-platform-adapters.js";

import { captureJobEngagementSnapshot } from "./snapshot.js";
import type { CapturedJobEngagementSnapshot } from "./snapshot.js";
import { isExactJobEngagementPage, isJobEngagementPage, jobEngagementPageUrl } from "./pages.js";

const emptyCollectionLength = 0;
const initialPageSettleMilliseconds = 1000;
const firstPage = 1;
const nextIndex = 1;

interface JobEngagementCollectionCoordination {
  readonly collectionControl: BackgroundCollectionControl;
  readonly observePageAccess: (page: PageAccessFacts) => void;
  readonly selectPage: (page: Page) => RiteCoroutine<void>;
}

interface EngagementScan {
  readonly jobs: JobEngagementEvidence[];
  readonly page: number;
}

function scanKey(platformId: PlatformId, engagement: JobEngagementKind): string {
  return `${platformId}:${engagement}`;
}

function evidenceIdentity(job: JobEngagementEvidence): string {
  return (
    job.externalJobId ??
    job.jobUrl ??
    JSON.stringify([job.company ?? null, job.title, job.location ?? null])
  );
}

function mergeEvidence(
  left: JobEngagementEvidence[],
  right: JobEngagementEvidence[],
): JobEngagementEvidence[] {
  const merged = new Map(left.map((job) => [evidenceIdentity(job), job]));
  for (const job of right) {
    merged.set(evidenceIdentity(job), job);
  }
  return [...merged.values()];
}

function toSnapshot(
  captured: CapturedJobEngagementSnapshot,
  jobs: JobEngagementEvidence[] = captured.jobs,
  complete: boolean = captured.complete,
): JobEngagementSnapshot {
  return {
    capturedAt: captured.capturedAt,
    complete,
    engagement: captured.engagement,
    jobs,
    platformId: captured.platformId,
    sourceUrl: captured.sourceUrl,
    total: captured.total,
  };
}

export class JobEngagementCollector {
  readonly #collectionControl: BackgroundCollectionControl;
  readonly #context: BrowserContext;
  readonly #engagementPages: ManagedPageTargets<PlatformId>;
  readonly #observePageAccess: (page: PageAccessFacts) => void;
  readonly #scans = new Map<string, EngagementScan>();
  readonly #selectPage: (page: Page) => RiteCoroutine<void>;
  readonly #writer: JobEngagementWriter;

  public constructor(
    context: BrowserContext,
    writer: JobEngagementWriter,
    recoveryRevision: (platformId: PlatformId) => number,
    coordination: JobEngagementCollectionCoordination,
  ) {
    this.#collectionControl = coordination.collectionControl;
    this.#context = context;
    this.#writer = writer;
    this.#observePageAccess = coordination.observePageAccess;
    this.#selectPage = coordination.selectPage;
    this.#engagementPages = new ManagedPageTargets<PlatformId>(
      isJobEngagementPage,
      recoveryRevision,
    );
  }

  public *synchronize(
    platformId: PlatformId,
    engagement: PlatformJobEngagementKind,
  ): RiteCoroutine<SynchronizeJobEngagementResult> {
    const collection = yield* this.#collectionControl.runCollection(() =>
      this.#captureSnapshot(platformId, engagement),
    );
    if (!collection.started) {
      throw new Error("用户正在控制浏览器；请等待用户明确交还控制权后再同步岗位跟进。");
    }
    return yield* this.#writer.write(collection.value);
  }

  *#captureSnapshot(
    platformId: PlatformId,
    engagement: PlatformJobEngagementKind,
  ): RiteCoroutine<JobEngagementSnapshot> {
    const pages = this.#context.pages();
    const key = scanKey(platformId, engagement);
    const scan = this.#scans.get(key) ?? { jobs: [], page: firstPage };
    const page = yield* this.#ensureEngagementPage(platformId, engagement, scan.page, pages);
    const captured = yield* captureJobEngagementSnapshot(page, this.#observePageAccess);
    const accumulatedJobs = mergeEvidence(scan.jobs, captured.jobs);
    const canPaginate = platformId === "boss";
    const canContinueScan = canPaginate && captured.completionTotal !== null;
    const complete =
      captured.complete || (canContinueScan && accumulatedJobs.length >= captured.completionTotal);
    const reachedEnd = complete || captured.jobs.length === emptyCollectionLength;
    if (reachedEnd || !canContinueScan) {
      this.#scans.delete(key);
      return {
        ...toSnapshot(captured, accumulatedJobs, complete),
        sourceUrl: jobEngagementPageUrl(platformId, engagement),
      };
    }
    this.#scans.set(key, { jobs: accumulatedJobs, page: scan.page + nextIndex });
    return toSnapshot(captured);
  }

  *#ensureEngagementPage(
    platformId: PlatformId,
    engagement: JobEngagementKind,
    pageNumber: number,
    pages: Page[],
  ): RiteCoroutine<Page> {
    const resolution = this.#engagementPages.resolve(platformId, pages);
    if (resolution.state === "waiting") {
      throw new Error(
        "岗位跟进标签页此前已离开目标列表；请先检查可见页面，并在必要的用户交接完成后再重试。",
      );
    }
    const page =
      resolution.state === "open" ? yield* until(() => this.#context.newPage()) : resolution.page;
    if (resolution.state === "open") {
      pages.push(page);
      this.#engagementPages.claim(platformId, page);
    }
    yield* this.#selectPage(page);
    if (!isExactJobEngagementPage(platformId, engagement, pageNumber, page.url())) {
      if (resolution.state !== "open") {
        this.#engagementPages.claim(platformId, page);
      }
      yield* until(() =>
        page.goto(jobEngagementPageUrl(platformId, engagement, pageNumber), {
          waitUntil: "domcontentloaded",
        }),
      );
      this.#engagementPages.observe(platformId, page);
      if (!isExactJobEngagementPage(platformId, engagement, pageNumber, page.url())) {
        throw new Error("导航后未到达请求的岗位跟进列表；请检查可见页面和平台访问状态。");
      }
      yield* sleep(initialPageSettleMilliseconds);
    }
    return page;
  }
}
