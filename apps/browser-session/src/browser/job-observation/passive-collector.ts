import type { BrowserContext, Page } from "patchright";
import type {
  JobCardObservation,
  JobDescriptionObservation,
  JobCardSnapshot,
} from "@job-boardwalk/contracts";
import { CanceledError, ScopeError, sleep } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

import type { JobObservationWriter } from "#/workspace-service/job-observation-writer.js";
import type { BackgroundCollectionControl } from "#/browser/background-collection-control.js";
import { extractExternalJobId } from "#/browser/platform-job-links.js";
import {
  isJobCardCollectionPage,
  isJobDetailPage,
} from "#/browser/recruiting-platform-adapters.js";
import type { PageAccessFacts } from "#/browser/recruiting-platform-adapters.js";
import { captureJobCardSnapshot } from "./card-snapshot.js";
import { captureJobDescriptionObservation } from "./description-observation.js";

const collectionIntervalMilliseconds = 30_000;
const maximumCardsPerPage = 100;
type CapturedJobEvidence = JobCardSnapshot | JobDescriptionObservation;

interface PassiveJobObservationCollectionCoordination {
  readonly collectionControl: BackgroundCollectionControl;
  readonly observePageAccess: (page: PageAccessFacts) => void;
}

export function observationsFromJobCardSnapshot(snapshot: JobCardSnapshot): JobCardObservation[] {
  return snapshot.cards.map((card) => {
    const sourceId = extractExternalJobId(snapshot.platformId, card.href);
    return {
      observedAt: snapshot.capturedAt,
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

export class PassiveJobObservationCollector {
  readonly #context: BrowserContext;
  readonly #collectionControl: BackgroundCollectionControl;
  readonly #observePageAccess: (page: PageAccessFacts) => void;
  readonly #writer: JobObservationWriter;

  public constructor(
    context: BrowserContext,
    writer: JobObservationWriter,
    coordination: PassiveJobObservationCollectionCoordination,
  ) {
    this.#collectionControl = coordination.collectionControl;
    this.#context = context;
    this.#observePageAccess = coordination.observePageAccess;
    this.#writer = writer;
  }

  public *collect(reportError: (error: Error) => void): RiteCoroutine<void> {
    const collection = yield* this.#collectionControl.runCollection(() =>
      this.#captureOpenPageEvidence(reportError),
    );
    if (!collection.started) {
      return;
    }
    for (const evidence of collection.value) {
      if ("cards" in evidence) {
        for (const observation of observationsFromJobCardSnapshot(evidence)) {
          yield* this.#writer.writeCardObservation(observation);
        }
      } else {
        yield* this.#writer.writeDescriptionObservation(evidence);
      }
    }
  }

  *#captureOpenPageEvidence(
    reportError: (error: Error) => void,
  ): RiteCoroutine<CapturedJobEvidence[]> {
    const evidenceItems: CapturedJobEvidence[] = [];
    for (const page of this.#context.pages()) {
      if (!isJobCardCollectionPage(page.url()) && !isJobDetailPage(page.url())) {
        continue;
      }
      const evidence = yield* this.#capturePageEvidence(page, reportError);
      if (!evidence) {
        continue;
      }
      evidenceItems.push(evidence);
    }
    return evidenceItems;
  }

  *#capturePageEvidence(
    page: Page,
    reportError: (error: Error) => void,
  ): RiteCoroutine<CapturedJobEvidence | null> {
    try {
      return isJobDetailPage(page.url())
        ? yield* captureJobDescriptionObservation(page, this.#observePageAccess)
        : yield* captureJobCardSnapshot(page, maximumCardsPerPage, this.#observePageAccess);
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
