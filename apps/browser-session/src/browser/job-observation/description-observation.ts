import type { Page } from "patchright";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import type { JobDescriptionObservation } from "@job-boardwalk/contracts";

import { extractExternalJobId } from "#/browser/platform-job-links.js";
import { requireJobDetailExtractionConfigs } from "#/browser/recruiting-platform-adapters.js";
import type {
  JobCardExtractionConfig,
  PageAccessFacts,
  JobDescriptionExtractionConfig,
} from "#/browser/platforms/types.js";

const accessTextCharacters = 5000;
const maximumAccessElements = 300;
const maximumDescriptionCharacters = 20_000;
const maximumFieldCharacters = 300;

interface JobDescriptionMetadata {
  accessElements: { href?: string }[];
  accessText: string;
  company: string | null;
  description: string;
  details: string[];
  educationRequirement: string | null;
  experienceRequirement: string | null;
  location: string | null;
  salaryText: string | null;
  title: string;
  truncated: boolean;
  url: string;
}

// This callback is self-contained because Patchright serializes it into the page realm.
// eslint-disable-next-line max-lines-per-function -- One bounded DOM extraction pass must carry its page-realm helpers.
export function captureJobDescriptionMetadata(input: {
  accessTextCharacters: number;
  cardConfig: JobCardExtractionConfig;
  descriptionConfig: JobDescriptionExtractionConfig;
  maximumAccessElements: number;
  maximumDescriptionCharacters: number;
  maximumFieldCharacters: number;
}): JobDescriptionMetadata {
  const { document } = globalThis;
  const firstIndex = 0;
  const lastIndex = -1;
  // InnerText preserves the posting's responsibility and requirement line boundaries.
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content
  const bodyText = document.body?.innerText ?? "";
  const helpers = {
    bounded(value: string, maximumCharacters: number): string {
      return helpers.normalized(value).slice(firstIndex, maximumCharacters);
    },
    firstPattern(value: string, pattern: string | undefined): string | null {
      return pattern ? (new RegExp(pattern, "u").exec(value)?.at(firstIndex) ?? null) : null;
    },
    firstText(selectors: readonly string[]): string | null {
      for (const selector of selectors) {
        for (const element of document.querySelectorAll(selector)) {
          const value = helpers
            .bounded(element.textContent ?? "", input.maximumFieldCharacters)
            .split("\n")
            .at(firstIndex);
          if (value) {
            return value;
          }
        }
      }
      return null;
    },
    lineBefore(marker: string | undefined): string | null {
      if (!marker) {
        return null;
      }
      const end = bodyText.indexOf(marker);
      if (end < firstIndex) {
        return null;
      }
      return helpers.normalized(bodyText.slice(firstIndex, end)).split("\n").at(lastIndex) ?? null;
    },
    normalized(value: string): string {
      return value
        .replaceAll("\r", "")
        .split("\n")
        .map((line) => line.replaceAll(/\s+/gu, " ").trim())
        .filter(Boolean)
        .join("\n");
    },
    textWithin(
      ranges:
        | readonly {
            endMarker: string;
            includeStartMarker?: boolean;
            startMarker: string;
          }[]
        | undefined,
    ): string {
      for (const range of ranges ?? []) {
        const start = bodyText.indexOf(range.startMarker);
        const contentStart = start + range.startMarker.length;
        const end = bodyText.indexOf(range.endMarker, contentStart);
        if (start >= firstIndex && end >= contentStart) {
          return bodyText.slice(range.includeStartMarker ? start : contentStart, end);
        }
      }
      return "";
    },
  };
  let unboundedDescription = "";
  for (const selector of input.descriptionConfig.descriptionSelectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) {
      continue;
    }
    // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- Preserve posting line boundaries.
    unboundedDescription = element.innerText;
    if (unboundedDescription.trim()) {
      break;
    }
  }
  unboundedDescription ||= helpers.textWithin(input.descriptionConfig.descriptionTextRanges);
  const normalizedDescription = helpers.normalized(unboundedDescription);
  const description = normalizedDescription.slice(firstIndex, input.maximumDescriptionCharacters);
  const factText = input.descriptionConfig.factTextSelectors
    ? input.descriptionConfig.factTextSelectors
        .flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)])
        // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- Match facts only in rendered posting text.
        .map((element) => element.innerText || "")
        .join("\n")
    : bodyText;
  const pageText = helpers.bounded(factText, Number.MAX_SAFE_INTEGER);
  const details = (
    input.descriptionConfig.detailsSelectors ?? input.cardConfig.detailsSelectors
  ).flatMap((selector) =>
    [...document.querySelectorAll(selector)]
      .map((element) => helpers.bounded(element.textContent ?? "", input.maximumFieldCharacters))
      .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index),
  );
  return {
    accessElements: [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
      .slice(firstIndex, input.maximumAccessElements)
      .map(({ href }) => ({ href })),
    accessText: bodyText.slice(firstIndex, input.accessTextCharacters),
    company: helpers.firstText(input.descriptionConfig.companySelectors),
    description,
    details,
    educationRequirement: helpers.firstPattern(pageText, input.cardConfig.educationTextPattern),
    experienceRequirement: helpers.firstPattern(pageText, input.cardConfig.experienceTextPattern),
    location: helpers.firstText(
      input.descriptionConfig.locationSelectors ?? input.cardConfig.locationSelectors,
    ),
    salaryText:
      helpers.firstText(
        input.descriptionConfig.salarySelectors ?? input.cardConfig.salarySelectors,
      ) ?? helpers.firstPattern(pageText, input.cardConfig.salaryTextPattern),
    title:
      helpers.firstText(
        input.descriptionConfig.titleSelectors ?? input.cardConfig.titleSelectors,
      ) ??
      helpers.firstText(["h1"]) ??
      helpers.lineBefore(input.descriptionConfig.titleLineBeforeMarker) ??
      "",
    truncated: normalizedDescription.length > input.maximumDescriptionCharacters,
    url: globalThis.location.href,
  };
}

// eslint-disable-next-line max-lines-per-function -- Validation and contract mapping stay beside the single page read.
export function* captureJobDescriptionObservation(
  page: Page,
  observePageAccess?: (page: PageAccessFacts) => void,
): RiteCoroutine<JobDescriptionObservation> {
  const initialUrl = page.url();
  const { cardConfig, descriptionConfig, platformId } =
    requireJobDetailExtractionConfigs(initialUrl);
  const metadata = yield* until(() =>
    page.evaluate(captureJobDescriptionMetadata, {
      accessTextCharacters,
      cardConfig,
      descriptionConfig,
      maximumAccessElements,
      maximumDescriptionCharacters,
      maximumFieldCharacters,
    }),
  );
  if (metadata.url !== initialUrl) {
    throw new Error("当前岗位详情页在读取期间发生了导航；请等待页面稳定后重试。");
  }
  if (!metadata.title || !metadata.description) {
    throw new Error("当前岗位详情页没有展示可识别的岗位标题和职位描述。");
  }
  observePageAccess?.({
    elements: metadata.accessElements,
    text: metadata.accessText,
    url: metadata.url,
  });
  const capturedAt = new Date().toISOString();
  const externalJobId = extractExternalJobId(platformId, metadata.url);
  return {
    observedAt: capturedAt,
    ...(metadata.company ? { company: metadata.company } : {}),
    description: {
      capturedAt,
      text: metadata.description,
      truncated: metadata.truncated,
    },
    details: metadata.details,
    ...(metadata.educationRequirement
      ? { educationRequirement: metadata.educationRequirement }
      : {}),
    ...(metadata.experienceRequirement
      ? { experienceRequirement: metadata.experienceRequirement }
      : {}),
    ...(externalJobId ? { externalJobId } : {}),
    jobUrl: metadata.url,
    ...(metadata.location ? { location: metadata.location } : {}),
    platformId,
    ...(metadata.salaryText ? { salaryText: metadata.salaryText } : {}),
    title: metadata.title,
  };
}
