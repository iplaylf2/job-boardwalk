import type { BrowserContext, Page } from "patchright";
import type {
  JobEngagementEvidence,
  JobEngagementKind,
  JobEngagementSnapshot,
} from "@job-boardwalk/contracts";
import { platformIds, platformJobEngagementKinds } from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import { CanceledError, ScopeError, sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

import type { JobEngagementWriter } from "#/workspace-service/job-engagement-writer.js";

import type { BackgroundCollectionControl } from "#/browser/background-collection-control.js";
import { ManagedPageTargets } from "#/browser/managed-page-targets.js";
import type { PageAccessFacts } from "#/browser/recruiting-platform-adapters.js";

import { captureJobEngagementSnapshot } from "./snapshot.js";
import type { CapturedJobEngagementSnapshot } from "./snapshot.js";
import { isExactJobEngagementPage, isJobEngagementPage, jobEngagementPageUrl } from "./pages.js";

const collectionIntervalMilliseconds = 30_000;
const emptyCollectionLength = 0;
const initialPageSettleMilliseconds = 1000;
const firstEngagementIndex = 0;
const firstPage = 1;
const nextIndex = 1;

interface JobEngagementCollectionCoordination {
  readonly collectionControl: BackgroundCollectionControl;
  readonly observePageAccess: (page: PageAccessFacts) => void;
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
  readonly #nextEngagementIndices = new Map<PlatformId, number>();
  readonly #observePageAccess: (page: PageAccessFacts) => void;
  readonly #scans = new Map<string, EngagementScan>();
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
    this.#engagementPages = new ManagedPageTargets<PlatformId>(
      isJobEngagementPage,
      recoveryRevision,
    );
  }

  public *collect(reportError: (error: Error) => void): RiteCoroutine<void> {
    const collection = yield* this.#collectionControl.runCollection(() =>
      this.#captureSnapshots(reportError),
    );
    if (!collection.started) {
      return;
    }
    for (const snapshot of collection.value) {
      try {
        yield* this.#writer.write(snapshot);
      } catch (error) {
        if (error instanceof CanceledError || error instanceof ScopeError) {
          throw error;
        }
        reportError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  *#captureSnapshots(reportError: (error: Error) => void): RiteCoroutine<JobEngagementSnapshot[]> {
    const snapshots: JobEngagementSnapshot[] = [];
    const pages = this.#context.pages();
    for (const platformId of platformIds) {
      try {
        const snapshot = yield* this.#capturePlatformEngagement(platformId, pages);
        if (snapshot) {
          snapshots.push(snapshot);
        }
      } catch (error) {
        if (error instanceof CanceledError || error instanceof ScopeError) {
          throw error;
        }
        reportError(error instanceof Error ? error : new Error(String(error)));
      }
    }
    return snapshots;
  }

  *#capturePlatformEngagement(
    platformId: PlatformId,
    pages: Page[],
  ): RiteCoroutine<JobEngagementSnapshot | null> {
    const engagementIndex = this.#nextEngagementIndices.get(platformId) ?? firstEngagementIndex;
    const engagement = platformJobEngagementKinds[engagementIndex]!;
    const key = scanKey(platformId, engagement);
    const scan = this.#scans.get(key) ?? { jobs: [], page: firstPage };
    const page = yield* this.#ensureEngagementPage(platformId, engagement, scan.page, pages);
    if (!page) {
      return null;
    }
    const captured = yield* captureJobEngagementSnapshot(page, this.#observePageAccess);
    const accumulatedJobs = mergeEvidence(scan.jobs, captured.jobs);
    const canPaginate = platformId === "boss";
    const canContinueScan = canPaginate && captured.completionTotal !== null;
    const complete =
      captured.complete || (canContinueScan && accumulatedJobs.length >= captured.completionTotal);
    const reachedEnd = complete || captured.jobs.length === emptyCollectionLength;
    if (reachedEnd || !canContinueScan) {
      this.#scans.delete(key);
      this.#nextEngagementIndices.set(
        platformId,
        (engagementIndex + nextIndex) % platformJobEngagementKinds.length,
      );
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
  ): RiteCoroutine<Page | null> {
    const resolution = this.#engagementPages.resolve(platformId, pages);
    if (resolution.state === "waiting") {
      return null;
    }
    const page =
      resolution.state === "open" ? yield* until(() => this.#context.newPage()) : resolution.page;
    if (resolution.state === "open") {
      pages.push(page);
      this.#engagementPages.claim(platformId, page);
    }
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
        return null;
      }
      yield* sleep(initialPageSettleMilliseconds);
    }
    return page;
  }

  public *run(reportError: (error: Error) => void): RiteCoroutine<never> {
    while (true) {
      try {
        yield* this.collect(reportError);
      } catch (error) {
        if (error instanceof CanceledError || error instanceof ScopeError) {
          throw error;
        }
        reportError(error instanceof Error ? error : new Error(String(error)));
      }
      yield* sleep(collectionIntervalMilliseconds);
    }
  }
}
