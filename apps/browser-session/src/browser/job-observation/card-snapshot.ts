import { captureJobCardMetadata } from "./card-page-capture.js";
import { OperationError } from "@job-boardwalk/contracts";
import type { Page } from "patchright";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import type { JobCardSnapshot } from "@job-boardwalk/contracts";

import { requireJobCardExtractionConfig } from "#/browser/recruiting-platform-adapters.js";
import type { PageAccessFacts } from "#/browser/platforms/types.js";

const accessTextCharacters = 5000;
const firstIndex = 0;
const maximumAccessElements = 300;
const maximumFieldCharacters = 300;
const maximumCardTextCharacters = 1500;

function normalizedText(value: string, maximumCharacters: number): string {
  return value.replaceAll(/\s+/gu, " ").trim().slice(firstIndex, maximumCharacters);
}

export function* captureJobCardSnapshot(
  page: Page,
  maximumCards: number,
  observePageAccess?: (page: PageAccessFacts) => void,
): RiteCoroutine<JobCardSnapshot> {
  const initialUrl = page.url();
  const { config, platformId } = requireJobCardExtractionConfig(initialUrl);
  const metadata = yield* until(() =>
    page.evaluate(captureJobCardMetadata, {
      accessTextCharacters,
      config,
      maximumAccessElements,
      maximumCardTextCharacters,
      maximumCards,
      maximumFieldCharacters,
    }),
  );
  if (metadata.url !== initialUrl) {
    throw new OperationError(
      "page-changed",
      "当前页面在读取期间发生了导航；请等待页面稳定后重试。",
      {},
    );
  }
  observePageAccess?.({
    elements: metadata.accessElements,
    text: metadata.accessText,
    url: metadata.url,
  });
  return {
    capturedAt: new Date().toISOString(),
    cards: metadata.cards.map((card) => ({
      ...card,
      ...(card.company ? { company: normalizedText(card.company, maximumFieldCharacters) } : {}),
    })),
    platformId,
    sourceTitle: metadata.title,
    sourceUrl: metadata.url,
    truncated: metadata.truncated,
  };
}
