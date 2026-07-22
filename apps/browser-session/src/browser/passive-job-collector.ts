import type { BrowserContext, Page } from "patchright";
import type { JobPostingObservation, JobCardSnapshot } from "@job-boardwalk/contracts";
import { CanceledError, ScopeError, sleep } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

import type { JobPostingWriter } from "#/workspace-service/job-posting-writer.js";
import type { BackgroundCollectionControl } from "./background-collection-control.js";
import { captureJobCardSnapshot } from "./job-card-snapshot.js";
import { extractExternalJobId } from "./platform-job-links.js";
import { isJobCardCollectionPage } from "./recruiting-platform-adapters.js";
import type { PageAccessFacts } from "./recruiting-platform-adapters.js";

const collectionIntervalMilliseconds = 30_000;
const maximumCardsPerPage = 100;

interface PassiveJobCollectionCoordination {
  readonly collectionControl: BackgroundCollectionControl;
  readonly observePageAccess: (page: PageAccessFacts) => void;
}

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

export class PassiveJobCollector {
  readonly #context: BrowserContext;
  readonly #collectionControl: BackgroundCollectionControl;
  readonly #observePageAccess: (page: PageAccessFacts) => void;
  readonly #writer: JobPostingWriter;

  public constructor(
    context: BrowserContext,
    writer: JobPostingWriter,
    coordination: PassiveJobCollectionCoordination,
  ) {
    this.#collectionControl = coordination.collectionControl;
    this.#context = context;
    this.#observePageAccess = coordination.observePageAccess;
    this.#writer = writer;
  }

  public *collect(reportError: (error: Error) => void): RiteCoroutine<void> {
    const collection = yield* this.#collectionControl.runCollection(() =>
      this.#captureSnapshots(reportError),
    );
    if (!collection.started) {
      return;
    }
    for (const snapshot of collection.value) {
      for (const observation of jobPostingObservations(snapshot)) {
        yield* this.#writer.write(observation);
      }
    }
  }

  *#captureSnapshots(reportError: (error: Error) => void): RiteCoroutine<JobCardSnapshot[]> {
    const snapshots: JobCardSnapshot[] = [];
    for (const page of this.#context.pages()) {
      if (!isJobCardCollectionPage(page.url())) {
        continue;
      }
      const snapshot = yield* this.#capturePage(page, reportError);
      if (!snapshot) {
        continue;
      }
      snapshots.push(snapshot);
    }
    return snapshots;
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
