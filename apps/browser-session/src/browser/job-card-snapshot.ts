import type { Page } from "patchright";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import type { JobCardEvidence, JobCardSnapshot } from "@job-boardwalk/contracts";

import { requireJobCardExtraction } from "./recruiting-platform-adapters.js";
import type { JobCardExtractionConfig, PageAccessFacts } from "./recruiting-platform-adapters.js";

const accessTextCharacters = 5000;
const firstIndex = 0;
const maximumAccessElements = 300;
const maximumFieldCharacters = 300;
const maximumJobCards = 100;
const maximumCardTextCharacters = 1500;
const minimumJobCards = 1;
const defaultMaximumJobCards = 50;

interface JobCardSnapshotMetadata {
  accessElements: { href?: string }[];
  accessText: string;
  cards: JobCardEvidence[];
  title: string;
  truncated: boolean;
  url: string;
}

function normalizedText(value: string, maximumCharacters: number): string {
  return value.replaceAll(/\s+/gu, " ").trim().slice(firstIndex, maximumCharacters);
}

// This callback is self-contained because Patchright serializes it into the page realm.
// eslint-disable-next-line complexity, max-lines-per-function, max-statements -- The serialized callback performs one bounded DOM extraction pass.
export function captureJobCardMetadata(input: {
  accessTextCharacters: number;
  config: JobCardExtractionConfig;
  maximumAccessElements: number;
  maximumFieldCharacters: number;
  maximumCardTextCharacters: number;
  maximumCards: number;
}): JobCardSnapshotMetadata {
  const { document } = globalThis;
  const startIndex = 0;
  const increment = 1;
  function normalized(value: string, maximumCharacters: number): string {
    const decoded = [...value]
      .map((character) => input.config.textReplacements?.[character] ?? character)
      .join("");
    return decoded.replaceAll(/\s+/gu, " ").trim().slice(startIndex, maximumCharacters);
  }
  function firstText(container: Element, selectors: readonly string[]): string | null {
    for (const selector of selectors) {
      const text = normalized(
        container.querySelector(selector)?.textContent ?? "",
        input.maximumFieldCharacters,
      );
      if (text) {
        return text;
      }
    }
    return null;
  }
  function firstLine(value: string): string {
    return (
      value
        .split(/\r?\n/u)
        .map((line) => normalized(line, input.maximumFieldCharacters))
        .find(Boolean) ?? ""
    );
  }
  function firstPattern(value: string, pattern: string | undefined): string | null {
    if (!pattern) {
      return null;
    }
    return new RegExp(pattern, "u").exec(value)?.at(startIndex) ?? null;
  }
  function closestContainer(link: HTMLAnchorElement): Element | null {
    for (const selector of input.config.containerSelectors) {
      const container = link.closest(selector);
      if (container) {
        return container;
      }
    }
    return input.config.requireContainerMatch ? null : link;
  }
  const linkPathPattern = new RegExp(input.config.jobLinkPathPattern, "u");
  const excludedTitlePattern = input.config.excludedTitlePattern
    ? new RegExp(input.config.excludedTitlePattern, "u")
    : null;
  const seenUrls = new Set<string>();
  const cards: JobCardEvidence[] = [];
  let matchingLinkCount = 0;
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    // eslint-disable-next-line init-declarations
    let href: URL;
    try {
      href = new URL(link.href, globalThis.location.href);
    } catch {
      continue;
    }
    if (
      href.origin !== globalThis.location.origin ||
      !linkPathPattern.test(href.pathname) ||
      seenUrls.has(href.href)
    ) {
      continue;
    }
    const container = closestContainer(link);
    if (!container) {
      continue;
    }
    // InnerText preserves the rendered block boundaries that separate Yupao card fields.
    // eslint-disable-next-line unicorn/prefer-dom-node-text-content
    const renderedLinkText = (link as HTMLElement).innerText || link.textContent || "";
    const text = normalized(container.textContent ?? "", input.maximumCardTextCharacters);
    const selectorTitle = firstText(container, input.config.titleSelectors);
    const fallbackTitle = input.config.titleFromFirstLine
      ? firstLine(renderedLinkText)
      : normalized(link.textContent ?? "", input.maximumFieldCharacters);
    const titleBoundary = firstPattern(fallbackTitle, input.config.titleBoundaryPattern);
    const title =
      selectorTitle ??
      normalized(
        titleBoundary
          ? fallbackTitle.slice(startIndex, fallbackTitle.indexOf(titleBoundary))
          : fallbackTitle,
        input.maximumFieldCharacters,
      );
    if (!title || !text || excludedTitlePattern?.test(title)) {
      continue;
    }
    seenUrls.add(href.href);
    matchingLinkCount += increment;
    if (cards.length === input.maximumCards) {
      continue;
    }
    const details = input.config.detailsSelectors.flatMap((selector) =>
      [...container.querySelectorAll(selector)]
        .map((element) => normalized(element.textContent ?? "", input.maximumFieldCharacters))
        .filter(
          (value, index, values) => value.length > startIndex && values.indexOf(value) === index,
        ),
    );
    const company = firstText(container, input.config.companySelectors);
    const location = firstText(container, input.config.locationSelectors);
    const educationRequirement = firstPattern(text, input.config.educationTextPattern);
    const experienceRequirement = firstPattern(text, input.config.experienceTextPattern);
    const salary =
      firstText(container, input.config.salarySelectors) ??
      firstPattern(text, input.config.salaryTextPattern);
    cards.push({
      ...(company ? { company } : {}),
      details: details.filter(
        (value) => value !== educationRequirement && value !== experienceRequirement,
      ),
      ...(educationRequirement ? { educationRequirement } : {}),
      ...(experienceRequirement ? { experienceRequirement } : {}),
      href: href.href,
      ...(location ? { location } : {}),
      ...(salary ? { salary } : {}),
      text,
      title,
    });
  }
  // InnerText preserves the visible header lines used by platform access assessment.
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content
  const accessText = document.body?.innerText ?? "";
  return {
    accessElements: [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
      .slice(startIndex, input.maximumAccessElements)
      .map(({ href }) => ({ href })),
    accessText: accessText.slice(startIndex, input.accessTextCharacters),
    cards,
    title: document.title,
    truncated: matchingLinkCount > input.maximumCards,
    url: globalThis.location.href,
  };
}

export function readMaximumJobCards(params: Record<string, unknown>): number {
  if (!("maximumCards" in params)) {
    return defaultMaximumJobCards;
  }
  const value = params["maximumCards"];
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimumJobCards ||
    value > maximumJobCards
  ) {
    throw new TypeError(
      `maximumCards 必须是 ${String(minimumJobCards)} 到 ${String(maximumJobCards)} 之间的数字。`,
    );
  }
  return value;
}

export function* captureJobCardSnapshot(
  page: Page,
  maximumCards: number,
  observePageAccess?: (page: PageAccessFacts) => void,
): RiteCoroutine<JobCardSnapshot> {
  const initialUrl = page.url();
  const { extraction, platformId } = requireJobCardExtraction(initialUrl);
  const metadata = yield* until(() =>
    page.evaluate(captureJobCardMetadata, {
      accessTextCharacters,
      config: extraction,
      maximumAccessElements,
      maximumCardTextCharacters,
      maximumCards,
      maximumFieldCharacters,
    }),
  );
  if (metadata.url !== initialUrl) {
    throw new Error("当前页面在读取期间发生了导航；请等待页面稳定后重试。");
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
