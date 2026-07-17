import type { BrowserContext } from "patchright";
import type {
  JobPostingObservation,
  RecommendationPageReference,
  RecommendationPageSnapshot,
} from "@job-boardwalk/contracts";
import { CanceledError, ScopeError, sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

import type { JobPostingWriter } from "#/workspace-service/job-posting-writer.js";
import type { SelectedRecommendationPageReader } from "#/workspace-service/selected-recommendation-page-reader.js";

import { captureRecommendationPage } from "./recommendation-page.js";
import { requireRecommendationPage } from "./recruiting-platform-adapters.js";
import type { PageAccessFacts } from "./recruiting-platform-adapters.js";

const collectionIntervalMilliseconds = 30_000;
const emptyCollectionLength = 0;
const initialPageSettleMilliseconds = 1000;
const maximumItemsPerPage = 100;

function externalJobId(jobUrl: string): string | undefined {
  const match = /\/(?<id>[^/]+?)(?:\.html?)?\/?$/u.exec(new URL(jobUrl).pathname);
  return match?.groups?.["id"];
}

export function jobPostingObservations(
  snapshot: RecommendationPageSnapshot,
): JobPostingObservation[] {
  return snapshot.items.map((item) => {
    const sourceId = externalJobId(item.href);
    return {
      collectedAt: snapshot.capturedAt,
      ...(item.company ? { company: item.company } : {}),
      details: item.details,
      discoveryUrl: snapshot.sourceUrl,
      ...(item.educationRequirement ? { educationRequirement: item.educationRequirement } : {}),
      ...(item.experienceRequirement ? { experienceRequirement: item.experienceRequirement } : {}),
      ...(sourceId ? { externalJobId: sourceId } : {}),
      jobUrl: item.href,
      ...(item.location ? { location: item.location } : {}),
      platformId: snapshot.platformId,
      ...(item.salary ? { salaryText: item.salary } : {}),
      summary: item.text,
      title: item.title,
    };
  });
}

function comparablePageUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.href;
}

export function recommendationPagesWithoutOpenTab(
  recommendationPages: RecommendationPageReference[],
  pageUrls: string[],
): RecommendationPageReference[] {
  const openPageUrls = new Set(pageUrls.map(comparablePageUrl));
  return recommendationPages.filter(({ url }) => !openPageUrls.has(comparablePageUrl(url)));
}

export class PassiveJobCollector {
  readonly #context: BrowserContext;
  readonly #observePageAccess: (page: PageAccessFacts) => void;
  readonly #recommendationPageReader: SelectedRecommendationPageReader;
  readonly #writer: JobPostingWriter;

  public constructor(
    context: BrowserContext,
    recommendationPageReader: SelectedRecommendationPageReader,
    writer: JobPostingWriter,
    observePageAccess: (page: PageAccessFacts) => void,
  ) {
    this.#context = context;
    this.#observePageAccess = observePageAccess;
    this.#recommendationPageReader = recommendationPageReader;
    this.#writer = writer;
  }

  public *collect(): RiteCoroutine<void> {
    const recommendationPages = yield* this.#recommendationPageReader.read();
    yield* this.#ensureRecommendationPages(recommendationPages);
    const selectedPageUrls = new Set(recommendationPages.map(({ url }) => comparablePageUrl(url)));
    for (const page of this.#context.pages()) {
      if (!selectedPageUrls.has(comparablePageUrl(page.url()))) {
        continue;
      }
      requireRecommendationPage(page.url());
      const snapshot = yield* captureRecommendationPage(
        page,
        maximumItemsPerPage,
        this.#observePageAccess,
      );
      for (const observation of jobPostingObservations(snapshot)) {
        yield* this.#writer.write(observation);
      }
    }
  }

  *#ensureRecommendationPages(
    recommendationPages: RecommendationPageReference[],
  ): RiteCoroutine<void> {
    const pages = this.#context.pages();
    const missingPages = recommendationPagesWithoutOpenTab(
      recommendationPages,
      pages.map((page) => page.url()),
    );
    for (const recommendationPage of missingPages) {
      const blankPage = pages.find((page) => page.url() === "about:blank");
      const page = blankPage ?? (yield* until(() => this.#context.newPage()));
      if (!blankPage) {
        pages.push(page);
      }
      yield* until(() => page.goto(recommendationPage.url));
    }
    if (missingPages.length > emptyCollectionLength) {
      yield* sleep(initialPageSettleMilliseconds);
    }
  }

  public *run(reportError: (error: Error) => void): RiteCoroutine<never> {
    while (true) {
      try {
        yield* this.collect();
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
