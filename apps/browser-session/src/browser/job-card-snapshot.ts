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
const maximumCardTextCharacters = 1500;

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
  const maximumContainerAncestorDepth = 6;
  // Object methods retain their names without tsx injecting the Node-side `__name` helper.
  // Patchright serializes this entire callback, so every helper must exist in the page realm.
  const helpers = {
    closestContainer(link: HTMLAnchorElement): Element | null {
      let firstCandidate: Element | null = null;
      for (const selector of input.config.containerSelectors) {
        const container = link.closest(selector);
        if (!container) {
          continue;
        }
        firstCandidate ??= container;
        if (helpers.containsCompany(container)) {
          return container;
        }
      }
      let ancestor: Element | null = link.parentElement;
      let depth = startIndex;
      while (ancestor && depth < maximumContainerAncestorDepth) {
        if (helpers.containsCompany(ancestor)) {
          return ancestor;
        }
        ancestor = ancestor.parentElement;
        depth += increment;
      }
      return firstCandidate ?? (input.config.requireContainerMatch ? null : link);
    },
    containsCompany(container: Element): boolean {
      return input.config.companySelectors.some((selector) =>
        Boolean(container.querySelector(selector)),
      );
    },
    firstLine(value: string): string {
      return (
        value
          .split(/\r?\n/u)
          .map((line) => helpers.normalized(line, input.maximumFieldCharacters))
          .find(Boolean) ?? ""
      );
    },
    firstPattern(value: string, pattern: string | undefined): string | null {
      if (!pattern) {
        return null;
      }
      return new RegExp(pattern, "u").exec(value)?.at(startIndex) ?? null;
    },
    firstText(container: Element, selectors: readonly string[]): string | null {
      for (const selector of selectors) {
        const text = helpers.normalized(
          container.querySelector(selector)?.textContent ?? "",
          input.maximumFieldCharacters,
        );
        if (text) {
          return text;
        }
      }
      return null;
    },
    normalized(value: string, maximumCharacters: number): string {
      const decoded = [...value]
        .map((character) => input.config.textReplacements?.[character] ?? character)
        .join("");
      return decoded.replaceAll(/\s+/gu, " ").trim().slice(startIndex, maximumCharacters);
    },
  };
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
    const container = helpers.closestContainer(link);
    if (!container) {
      continue;
    }
    // InnerText preserves the rendered block boundaries that separate Yupao card fields.
    // eslint-disable-next-line unicorn/prefer-dom-node-text-content
    const renderedLinkText = (link as HTMLElement).innerText || link.textContent || "";
    const text = helpers.normalized(container.textContent ?? "", input.maximumCardTextCharacters);
    const selectorTitle = helpers.firstText(container, input.config.titleSelectors);
    const fallbackTitle = input.config.titleFromFirstLine
      ? helpers.firstLine(renderedLinkText)
      : helpers.normalized(link.textContent ?? "", input.maximumFieldCharacters);
    const titleBoundary = helpers.firstPattern(fallbackTitle, input.config.titleBoundaryPattern);
    const title =
      selectorTitle ??
      helpers.normalized(
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
        .map((element) =>
          helpers.normalized(element.textContent ?? "", input.maximumFieldCharacters),
        )
        .filter(
          (value, index, values) => value.length > startIndex && values.indexOf(value) === index,
        ),
    );
    const company = helpers.firstText(container, input.config.companySelectors);
    const companyOffset = company ? text.lastIndexOf(company) + company.length : startIndex;
    const location =
      helpers.firstText(container, input.config.locationSelectors) ??
      (company && companyOffset >= company.length
        ? helpers.normalized(text.slice(companyOffset), input.maximumFieldCharacters) || null
        : null);
    const educationRequirement = helpers.firstPattern(text, input.config.educationTextPattern);
    const experienceRequirement = helpers.firstPattern(text, input.config.experienceTextPattern);
    const salary =
      helpers.firstText(container, input.config.salarySelectors) ??
      helpers.firstPattern(text, input.config.salaryTextPattern);
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
