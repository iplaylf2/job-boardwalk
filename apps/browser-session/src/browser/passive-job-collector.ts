import type { BrowserContext, Page } from "patchright";
import type {
  JobPostingObservation,
  JobCardSnapshot,
  RecommendationPageReference,
} from "@job-boardwalk/contracts";
import { CanceledError, ScopeError, sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

import type { JobPostingWriter } from "#/workspace-service/job-posting-writer.js";
import type { SelectedJobSearchIntentReader } from "#/workspace-service/selected-job-search-intent-reader.js";

import { captureJobCardSnapshot } from "./job-card-snapshot.js";
import { ManagedPageTargets } from "./managed-page-targets.js";
import { extractExternalJobId } from "./platform-job-links.js";
import { findRecruitingPlatformAdapter } from "./recruiting-platform-adapters.js";
import type { PageAccessFacts } from "./recruiting-platform-adapters.js";

const collectionIntervalMilliseconds = 30_000;
const initialPageSettleMilliseconds = 1000;
const maximumCardsPerPage = 100;

export function jobPostingObservations(snapshot: JobCardSnapshot): JobPostingObservation[] {
  return snapshot.cards.map((card) => {
    const sourceId = extractExternalJobId(snapshot.platformId, card.href);
    return {
      collectedAt: snapshot.capturedAt,
      ...(card.company ? { company: card.company } : {}),
      details: card.details,
      discoveryUrl: snapshot.sourceUrl,
      ...(card.educationRequirement ? { educationRequirement: card.educationRequirement } : {}),
      ...(card.experienceRequirement ? { experienceRequirement: card.experienceRequirement } : {}),
      ...(sourceId ? { externalJobId: sourceId } : {}),
      jobUrl: card.href,
      ...(card.location ? { location: card.location } : {}),
      platformId: snapshot.platformId,
      ...(card.salary ? { salaryText: card.salary } : {}),
      summary: card.text,
      title: card.title,
    };
  });
}

function comparablePageUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.href;
}

export class PassiveJobCollector {
  readonly #context: BrowserContext;
  readonly #observePageAccess: (page: PageAccessFacts) => void;
  readonly #recommendationPages = new ManagedPageTargets<string>(
    (targetUrl, pageUrl) => comparablePageUrl(pageUrl) === targetUrl,
  );
  readonly #selectedIntentReader: SelectedJobSearchIntentReader;
  readonly #writer: JobPostingWriter;

  public constructor(
    context: BrowserContext,
    selectedIntentReader: SelectedJobSearchIntentReader,
    writer: JobPostingWriter,
    observePageAccess: (page: PageAccessFacts) => void,
  ) {
    this.#context = context;
    this.#observePageAccess = observePageAccess;
    this.#selectedIntentReader = selectedIntentReader;
    this.#writer = writer;
  }

  public *collect(reportError: (error: Error) => void): RiteCoroutine<void> {
    const selectedIntent = yield* this.#selectedIntentReader.read();
    if (selectedIntent) {
      yield* this.#ensureRecommendationPages(selectedIntent.recommendationPages);
    }
    for (const page of this.#context.pages()) {
      if (!findRecruitingPlatformAdapter(page.url())) {
        continue;
      }
      const snapshot = yield* this.#capturePage(page, reportError);
      if (!snapshot) {
        continue;
      }
      for (const observation of jobPostingObservations(snapshot)) {
        yield* this.#writer.write(observation);
      }
    }
  }

  *#capturePage(
    page: Page,
    reportError: (error: Error) => void,
  ): RiteCoroutine<JobCardSnapshot | null> {
    try {
      return yield* captureJobCardSnapshot(page, maximumCardsPerPage, this.#observePageAccess);
    } catch (error) {
      if (error instanceof CanceledError || error instanceof ScopeError) {
        throw error;
      }
      reportError(error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  *#ensureRecommendationPages(
    recommendationPages: RecommendationPageReference[],
  ): RiteCoroutine<void> {
    const pages = this.#context.pages();
    let navigatedPage = false;
    for (const recommendationPage of recommendationPages) {
      const comparableUrl = comparablePageUrl(recommendationPage.url);
      const resolution = this.#recommendationPages.resolve(comparableUrl, pages);
      if (resolution.state === "ready" || resolution.state === "waiting") {
        continue;
      }
      const page =
        resolution.state === "navigate"
          ? resolution.page
          : yield* until(() => this.#context.newPage());
      if (resolution.state === "open") {
        pages.push(page);
      }
      this.#recommendationPages.claim(comparableUrl, page);
      yield* until(() => page.goto(recommendationPage.url));
      this.#recommendationPages.observe(comparableUrl, page);
      navigatedPage = true;
    }
    if (navigatedPage) {
      yield* sleep(initialPageSettleMilliseconds);
    }
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
