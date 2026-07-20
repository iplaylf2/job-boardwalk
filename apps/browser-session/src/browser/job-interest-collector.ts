import type { BrowserContext, Page } from "patchright";
import { platformIds } from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import { CanceledError, ScopeError, sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

import type { JobInterestWriter } from "#/workspace-service/job-interest-writer.js";

import { captureJobInterestSnapshot } from "./job-interest-snapshot.js";
import { interestListPageUrl, isInterestListPage } from "./recruiting-platform-adapters.js";
import type { PageAccessFacts } from "./recruiting-platform-adapters.js";

const collectionIntervalMilliseconds = 30_000;
const initialPageSettleMilliseconds = 1000;

export class JobInterestCollector {
  readonly #context: BrowserContext;
  readonly #interestListPages = new Map<PlatformId, Page>();
  readonly #observePageAccess: (page: PageAccessFacts) => void;
  readonly #writer: JobInterestWriter;

  public constructor(
    context: BrowserContext,
    writer: JobInterestWriter,
    observePageAccess: (page: PageAccessFacts) => void,
  ) {
    this.#context = context;
    this.#writer = writer;
    this.#observePageAccess = observePageAccess;
  }

  public *collect(reportError: (error: Error) => void): RiteCoroutine<void> {
    const pages = yield* this.#ensureInterestListPages();
    for (const page of pages) {
      try {
        const snapshot = yield* captureJobInterestSnapshot(page, this.#observePageAccess);
        yield* this.#writer.write(snapshot);
      } catch (error) {
        if (error instanceof CanceledError || error instanceof ScopeError) {
          throw error;
        }
        reportError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  #findInterestListPage(platformId: PlatformId, pages: Page[]): Page | null {
    const managedPage = this.#interestListPages.get(platformId);
    if (managedPage && pages.includes(managedPage)) {
      return managedPage;
    }
    this.#interestListPages.delete(platformId);
    const existingPage = pages.find((page) => isInterestListPage(platformId, page.url())) ?? null;
    if (existingPage) {
      this.#interestListPages.set(platformId, existingPage);
    }
    return existingPage;
  }

  *#ensureInterestListPages(): RiteCoroutine<Page[]> {
    const pages = this.#context.pages();
    const interestListPages: Page[] = [];
    let openedPage = false;
    for (const platformId of platformIds) {
      const existingPage = this.#findInterestListPage(platformId, pages);
      if (existingPage) {
        interestListPages.push(existingPage);
        continue;
      }
      const page = yield* until(() => this.#context.newPage());
      pages.push(page);
      this.#interestListPages.set(platformId, page);
      yield* until(() =>
        page.goto(interestListPageUrl(platformId), { waitUntil: "domcontentloaded" }),
      );
      interestListPages.push(page);
      openedPage = true;
    }
    if (openedPage) {
      yield* sleep(initialPageSettleMilliseconds);
    }
    return interestListPages;
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
