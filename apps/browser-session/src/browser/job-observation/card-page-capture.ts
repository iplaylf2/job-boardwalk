import type { JobCardEvidence, JobCardSnapshot } from "@job-boardwalk/contracts";
import type { JobCardExtractionConfig } from "#/browser/platforms/types.js";

interface JobCardSnapshotMetadata {
  accessElements: { href?: string }[];
  accessText: string;
  cards: JobCardEvidence[];
  coverage: JobCardSnapshot["coverage"];
  title: string;
  truncated: boolean;
  url: string;
}

// This callback is self-contained because Patchright serializes it into the page realm.
// eslint-disable-next-line max-lines-per-function -- The serialized page callback must contain its helpers; each helper remains subject to complexity and size checks.
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
  const candidateSelector = input.config.cardSelector ?? "a[href]";
  // Object methods retain their names without tsx injecting the Node-side `__name` helper.
  // Patchright serializes this entire callback, so every helper must exist in the page realm.
  const helpers = {
    captureCards(): { cards: JobCardEvidence[]; coverage: JobCardSnapshotMetadata["coverage"] } {
      const seenJobIdentities = new Set<string>();
      const cards: JobCardEvidence[] = [];
      const candidates = document.querySelectorAll<HTMLElement>(candidateSelector);
      const counts = { duplicateCandidates: 0, recognizedCards: 0, rejectedCandidates: 0 };
      for (const candidate of candidates) {
        const captured = helpers.readCandidate(candidate);
        if (!captured) {
          counts.rejectedCandidates += increment;
          continue;
        }
        const { card, jobIdentity } = captured;
        if (jobIdentity && seenJobIdentities.has(jobIdentity)) {
          counts.duplicateCandidates += increment;
          continue;
        }
        if (jobIdentity) {
          seenJobIdentities.add(jobIdentity);
        }
        counts.recognizedCards += increment;
        if (cards.length === input.maximumCards) {
          continue;
        }
        cards.push(card);
      }
      return {
        cards,
        coverage: {
          candidateElements: candidates.length,
          candidateSelector,
          duplicateCandidates: counts.duplicateCandidates,
          recognizedCards: counts.recognizedCards,
          rejectedCandidates: counts.rejectedCandidates,
          returnedCards: cards.length,
          scope: "loaded-document",
        },
      };
    },
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
      if (input.config.requireContainerMatch) {
        return firstCandidate;
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
      return firstCandidate ?? link;
    },
    containsCompany(container: Element): boolean {
      return input.config.companySelectors.some((selector) =>
        Boolean(container.querySelector(selector)),
      );
    },
    details(container: Element): string[] {
      return input.config.detailsSelectors.flatMap((selector) =>
        [...container.querySelectorAll(selector)]
          .map((element) =>
            helpers.normalized(element.textContent ?? "", input.maximumFieldCharacters),
          )
          .filter(
            (value, index, values) => value.length > startIndex && values.indexOf(value) === index,
          ),
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
    jobUrl(candidate: HTMLElement): URL | null {
      const links = input.config.cardSelector
        ? [...candidate.querySelectorAll<HTMLAnchorElement>("a[href]")]
        : [candidate as HTMLAnchorElement];
      let href: URL | null = null;
      for (const link of links) {
        try {
          const url = new URL(link.href, globalThis.location.href);
          const allowedOrigin = input.config.jobLinkOrigins
            ? input.config.jobLinkOrigins.includes(url.origin)
            : url.origin === globalThis.location.origin;
          if (
            allowedOrigin &&
            !url.username &&
            !url.password &&
            linkPathPattern.test(url.pathname)
          ) {
            href = url;
            break;
          }
        } catch {
          continue;
        }
      }
      return href;
    },
    location(container: Element, company: string | null, text: string): string | null {
      const companyOffset = company ? text.lastIndexOf(company) + company.length : startIndex;
      return (
        helpers.firstText(container, input.config.locationSelectors) ??
        (company && companyOffset >= company.length
          ? helpers.normalized(text.slice(companyOffset), input.maximumFieldCharacters) || null
          : null)
      );
    },
    normalized(value: string, maximumCharacters: number): string {
      const decoded = [...value]
        .map((character) => input.config.textReplacements?.[character] ?? character)
        .join("");
      return decoded.replaceAll(/\s+/gu, " ").trim().slice(startIndex, maximumCharacters);
    },
    readCandidate(
      candidate: HTMLElement,
    ): { card: JobCardEvidence; jobIdentity: string | null } | null {
      const href = helpers.jobUrl(candidate);
      if (!href && !input.config.cardSelector) {
        return null;
      }
      const container = input.config.cardSelector
        ? candidate
        : helpers.closestContainer(candidate as HTMLAnchorElement);
      if (!container) {
        return null;
      }
      const card = helpers.readCard(candidate, container, href);
      if (!card) {
        return null;
      }
      const jobIdentity = href
        ? (linkPathPattern.exec(href.pathname)?.groups?.["externalJobId"] ?? href.pathname)
        : null;
      return { card, jobIdentity };
    },
    readCard(candidate: HTMLElement, container: Element, href: URL | null): JobCardEvidence | null {
      const text = helpers.normalized(container.textContent ?? "", input.maximumCardTextCharacters);
      const { selectorTitle, title } = helpers.title(candidate, container);
      if (
        (input.config.cardSelector && !selectorTitle) ||
        !title ||
        !text ||
        excludedTitlePattern?.test(title)
      ) {
        return null;
      }
      const details = helpers.details(container);
      const company = helpers.firstText(container, input.config.companySelectors);
      const location = helpers.location(container, company, text);
      const educationRequirement = helpers.firstPattern(text, input.config.educationTextPattern);
      const experienceRequirement = helpers.firstPattern(text, input.config.experienceTextPattern);
      const salary =
        helpers.firstText(container, input.config.salarySelectors) ??
        helpers.firstPattern(text, input.config.salaryTextPattern);
      return {
        ...(company ? { company } : {}),
        details: details.filter(
          (value) => value !== educationRequirement && value !== experienceRequirement,
        ),
        ...(educationRequirement ? { educationRequirement } : {}),
        ...(experienceRequirement ? { experienceRequirement } : {}),
        ...(href ? { href: href.href } : {}),
        ...(location ? { location } : {}),
        ...(salary ? { salary } : {}),
        text,
        title,
      };
    },
    title(
      candidate: HTMLElement,
      container: Element,
    ): { selectorTitle: string | null; title: string } {
      const renderedLinkText = candidate.innerText || candidate.textContent || "";
      const selectorTitle = helpers.firstText(container, input.config.titleSelectors);
      const fallbackTitle = input.config.titleFromFirstLine
        ? helpers.firstLine(renderedLinkText)
        : helpers.normalized(candidate.textContent ?? "", input.maximumFieldCharacters);
      const titleBoundary = helpers.firstPattern(fallbackTitle, input.config.titleBoundaryPattern);
      const title =
        selectorTitle ??
        helpers.normalized(
          titleBoundary
            ? fallbackTitle.slice(startIndex, fallbackTitle.indexOf(titleBoundary))
            : fallbackTitle,
          input.maximumFieldCharacters,
        );
      return { selectorTitle, title };
    },
  };
  const linkPathPattern = new RegExp(input.config.jobLinkPathPattern, "u");
  const excludedTitlePattern = input.config.excludedTitlePattern
    ? new RegExp(input.config.excludedTitlePattern, "u")
    : null;
  const { cards, coverage } = helpers.captureCards();
  // InnerText preserves the visible header lines used by platform access assessment.
  const accessText = document.body?.innerText ?? "";
  return {
    accessElements: [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
      .slice(startIndex, input.maximumAccessElements)
      .map(({ href }) => ({ href })),
    accessText: accessText.slice(startIndex, input.accessTextCharacters),
    cards,
    coverage,
    title: document.title,
    truncated: coverage.recognizedCards > input.maximumCards,
    url: globalThis.location.href,
  };
}
