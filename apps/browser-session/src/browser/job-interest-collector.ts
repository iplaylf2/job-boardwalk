import type { BrowserContext, Page } from "patchright";
import type { JobInterestSnapshot } from "@job-boardwalk/contracts";
import { platformIds } from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import { CanceledError, ScopeError, sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

import type { JobInterestWriter } from "#/workspace-service/job-interest-writer.js";

import type { BackgroundCollectionControl } from "./background-collection-control.js";
import { captureJobInterestSnapshot } from "./job-interest-snapshot.js";
import { ManagedPageTargets } from "./managed-page-targets.js";
import { interestListPageUrl, isInterestListPage } from "./recruiting-platform-adapters.js";
import type { PageAccessFacts } from "./recruiting-platform-adapters.js";

const collectionIntervalMilliseconds = 30_000;
const initialPageSettleMilliseconds = 1000;

interface EnsuredInterestListPage {
  readonly navigated: boolean;
  readonly page: Page | null;
}

interface JobInterestCollectionCoordination {
  readonly collectionControl: BackgroundCollectionControl;
  readonly observePageAccess: (page: PageAccessFacts) => void;
}

export class JobInterestCollector {
  readonly #collectionControl: BackgroundCollectionControl;
  readonly #context: BrowserContext;
  readonly #interestListPages: ManagedPageTargets<PlatformId>;
  readonly #observePageAccess: (page: PageAccessFacts) => void;
  readonly #writer: JobInterestWriter;

  public constructor(
    context: BrowserContext,
    writer: JobInterestWriter,
    recoveryRevision: (platformId: PlatformId) => number,
    coordination: JobInterestCollectionCoordination,
  ) {
    this.#collectionControl = coordination.collectionControl;
    this.#context = context;
    this.#writer = writer;
    this.#observePageAccess = coordination.observePageAccess;
    this.#interestListPages = new ManagedPageTargets<PlatformId>(
      isInterestListPage,
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

  *#captureSnapshots(reportError: (error: Error) => void): RiteCoroutine<JobInterestSnapshot[]> {
    const snapshots: JobInterestSnapshot[] = [];
    const pages = yield* this.#ensureInterestListPages();
    for (const page of pages) {
      try {
        snapshots.push(yield* captureJobInterestSnapshot(page, this.#observePageAccess));
      } catch (error) {
        if (error instanceof CanceledError || error instanceof ScopeError) {
          throw error;
        }
        reportError(error instanceof Error ? error : new Error(String(error)));
      }
    }
    return snapshots;
  }

  *#ensureInterestListPages(): RiteCoroutine<Page[]> {
    const pages = this.#context.pages();
    const interestListPages: Page[] = [];
    let navigatedPage = false;
    for (const platformId of platformIds) {
      const ensuredPage = yield* this.#ensureInterestListPage(platformId, pages);
      if (ensuredPage.page) {
        interestListPages.push(ensuredPage.page);
      }
      navigatedPage ||= ensuredPage.navigated;
    }
    if (navigatedPage) {
      yield* sleep(initialPageSettleMilliseconds);
    }
    return interestListPages;
  }

  *#ensureInterestListPage(
    platformId: PlatformId,
    pages: Page[],
  ): RiteCoroutine<EnsuredInterestListPage> {
    const resolution = this.#interestListPages.resolve(platformId, pages);
    if (resolution.state === "ready") {
      return { navigated: false, page: resolution.page };
    }
    if (resolution.state === "waiting") {
      return { navigated: false, page: null };
    }
    const page =
      resolution.state === "navigate"
        ? resolution.page
        : yield* until(() => this.#context.newPage());
    if (resolution.state === "open") {
      pages.push(page);
    }
    this.#interestListPages.claim(platformId, page);
    yield* until(() =>
      page.goto(interestListPageUrl(platformId), { waitUntil: "domcontentloaded" }),
    );
    this.#interestListPages.observe(platformId, page);
    return {
      navigated: true,
      page: isInterestListPage(platformId, page.url()) ? page : null,
    };
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
