import type { Page } from "patchright";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import type { RecommendedJobEvidence, RecommendationPageSnapshot } from "@job-boardwalk/contracts";

import { requireRecommendationPage } from "./recruiting-platform-adapters.js";
import type { RecommendationExtractionConfig } from "./recruiting-platform-adapters.js";

const firstIndex = 0;
const maximumFieldCharacters = 300;
const maximumRecommendationItems = 100;
const maximumItemTextCharacters = 1500;
const minimumRecommendationItems = 1;
const defaultMaximumRecommendationItems = 50;

interface RecommendationPageMetadata {
  items: RecommendedJobEvidence[];
  title: string;
  truncated: boolean;
  url: string;
}

function normalizedText(value: string, maximumCharacters: number): string {
  return value.replaceAll(/\s+/gu, " ").trim().slice(firstIndex, maximumCharacters);
}

// This callback is self-contained because Patchright serializes it into the page realm.
// eslint-disable-next-line max-lines-per-function, max-statements
export function captureRecommendationMetadata(input: {
  config: RecommendationExtractionConfig;
  maximumFieldCharacters: number;
  maximumItemTextCharacters: number;
  maximumItems: number;
}): RecommendationPageMetadata {
  const { document } = globalThis;
  const startIndex = 0;
  const increment = 1;
  function normalized(value: string, maximumCharacters: number): string {
    return value.replaceAll(/\s+/gu, " ").trim().slice(startIndex, maximumCharacters);
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
  const items: RecommendedJobEvidence[] = [];
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
    const title =
      firstText(container, input.config.titleSelectors) ??
      normalized(link.textContent ?? "", input.maximumFieldCharacters);
    const text = normalized(container.textContent ?? "", input.maximumItemTextCharacters);
    if (!title || !text || excludedTitlePattern?.test(title)) {
      continue;
    }
    seenUrls.add(href.href);
    matchingLinkCount += increment;
    if (items.length === input.maximumItems) {
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
    const salary = firstText(container, input.config.salarySelectors);
    items.push({
      ...(company ? { company } : {}),
      details,
      href: href.href,
      ...(location ? { location } : {}),
      ...(salary ? { salary } : {}),
      text,
      title,
    });
  }
  return {
    items,
    title: document.title,
    truncated: matchingLinkCount > input.maximumItems,
    url: globalThis.location.href,
  };
}

export function readMaximumRecommendationItems(params: Record<string, unknown>): number {
  if (!("maximumItems" in params)) {
    return defaultMaximumRecommendationItems;
  }
  const value = params["maximumItems"];
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimumRecommendationItems ||
    value > maximumRecommendationItems
  ) {
    throw new TypeError(
      `maximumItems 必须是 ${String(minimumRecommendationItems)} 到 ${String(maximumRecommendationItems)} 之间的数字。`,
    );
  }
  return value;
}

export function* captureRecommendationPage(
  page: Page,
  maximumItems: number,
): RiteCoroutine<RecommendationPageSnapshot> {
  const initialUrl = page.url();
  const { extraction, pageKind, platformId } = requireRecommendationPage(initialUrl);
  const metadata = yield* until(() =>
    page.evaluate(captureRecommendationMetadata, {
      config: extraction,
      maximumFieldCharacters,
      maximumItemTextCharacters,
      maximumItems,
    }),
  );
  if (metadata.url !== initialUrl) {
    throw new Error("推荐职位页面在读取期间发生了导航；请稳定页面后重试。");
  }
  return {
    capturedAt: new Date().toISOString(),
    items: metadata.items.map((item) => ({
      ...item,
      ...(item.company ? { company: normalizedText(item.company, maximumFieldCharacters) } : {}),
    })),
    pageKind,
    platformId,
    sourceTitle: metadata.title,
    sourceUrl: metadata.url,
    truncated: metadata.truncated,
  };
}
