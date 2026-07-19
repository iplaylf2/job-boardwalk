import type { BrowserContext, Page } from "patchright";
import { platformIds } from "@job-boardwalk/platform-catalog";
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

  *#ensureInterestListPages(): RiteCoroutine<Page[]> {
    const pages = this.#context.pages();
    const interestListPages: Page[] = [];
    let openedPage = false;
    for (const platformId of platformIds) {
      const existingPage = pages.find((page) => isInterestListPage(platformId, page.url()));
      if (existingPage) {
        interestListPages.push(existingPage);
        continue;
      }
      const page = yield* until(() => this.#context.newPage());
      pages.push(page);
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
