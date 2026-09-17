import type {
  JobCardExtractionConfig,
  JobDescriptionExtractionConfig,
} from "#/browser/platforms/types.js";

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
  recruitmentClosure: string | null;
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
  const accessText = document.body?.innerText ?? "";
  const helpers = {
    bounded(value: string, maximumCharacters: number): string {
      return helpers.normalized(value).slice(firstIndex, maximumCharacters);
    },
    descriptionText(): string {
      for (const selector of input.descriptionConfig.descriptionSelectors) {
        const element = document.querySelector<HTMLElement>(selector);
        const text = element?.innerText ?? "";
        if (text.trim()) {
          return text;
        }
      }
      return helpers.textWithin(input.descriptionConfig.descriptionTextRanges);
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
    locationFromText(): string | null {
      const config = input.descriptionConfig.locationText;
      if (!config) {
        return null;
      }
      for (const selector of config.selectors) {
        for (const element of document.querySelectorAll<HTMLElement>(selector)) {
          const renderedText = element === document.body ? bodyText : element.innerText || "";
          const text = helpers.normalized(renderedText);
          const location = new RegExp(config.pattern, "u").exec(text)?.groups?.["location"]?.trim();
          if (location) {
            return helpers.bounded(location, input.maximumFieldCharacters);
          }
        }
      }
      return null;
    },
    mainText(): string {
      const markers = input.descriptionConfig.pageTextEndMarkers;
      if (!markers) {
        return accessText;
      }
      const boundary = new RegExp(`^[ \t]*(?:${markers.join("|")})[ \t]*$`, "mu");
      return accessText.slice(firstIndex, boundary.exec(accessText)?.index ?? accessText.length);
    },
    normalized(value: string): string {
      let decodedValue = value;
      for (const [encoded, decoded] of Object.entries(input.cardConfig.textReplacements ?? {})) {
        decodedValue = decodedValue.replaceAll(encoded, decoded);
      }
      return decodedValue
        .replaceAll("\r", "")
        .split("\n")
        .map((line) => line.replaceAll(/\s+/gu, " ").trim())
        .filter(Boolean)
        .join("\n");
    },
    salaryFromText(value: string): string | null {
      const marker = input.descriptionConfig.salaryTextEndMarker;
      const end = marker ? Math.max(firstIndex, value.indexOf(marker)) : value.length;
      return helpers.firstPattern(
        value.slice(firstIndex, end),
        input.descriptionConfig.salaryTextPattern ?? input.cardConfig.salaryTextPattern,
      );
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
      let earliestStart = Number.POSITIVE_INFINITY;
      let earliestEnd = Number.POSITIVE_INFINITY;
      let description = "";
      for (const range of ranges ?? []) {
        const start = bodyText.indexOf(range.startMarker);
        const contentStart = start + range.startMarker.length;
        const end = bodyText.indexOf(range.endMarker, contentStart);
        if (
          start >= firstIndex &&
          (start < earliestStart || (start === earliestStart && end < earliestEnd)) &&
          end >= contentStart &&
          helpers.normalized(bodyText.slice(contentStart, end))
        ) {
          earliestStart = start;
          earliestEnd = end;
          description = bodyText.slice(range.includeStartMarker ? start : contentStart, end);
        }
      }
      return description;
    },
    titleFromText(): string | null {
      const pattern = input.descriptionConfig.titleTextPattern;
      return pattern
        ? (new RegExp(pattern, "u")
            .exec(helpers.normalized(bodyText))
            ?.groups?.["title"]?.slice(firstIndex, input.maximumFieldCharacters) ?? null)
        : null;
    },
  };
  const bodyText = helpers.mainText();
  const normalizedDescription = helpers.normalized(helpers.descriptionText());
  const description = normalizedDescription.slice(firstIndex, input.maximumDescriptionCharacters);
  const factText = input.descriptionConfig.factTextSelectors
    ? input.descriptionConfig.factTextSelectors
        .flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)])
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
    accessText: accessText.slice(firstIndex, input.accessTextCharacters),
    company: helpers.firstText(input.descriptionConfig.companySelectors),
    description,
    details,
    educationRequirement: helpers.firstPattern(pageText, input.cardConfig.educationTextPattern),
    experienceRequirement: helpers.firstPattern(pageText, input.cardConfig.experienceTextPattern),
    location:
      helpers.locationFromText() ??
      helpers.firstText(
        input.descriptionConfig.locationSelectors ?? input.cardConfig.locationSelectors,
      ),
    recruitmentClosure: input.descriptionConfig.recruitmentClosedTextPattern
      ? (new RegExp(input.descriptionConfig.recruitmentClosedTextPattern, "u").exec(
          helpers.normalized(bodyText),
        )?.groups?.["evidence"] ?? null)
      : null,
    salaryText:
      helpers.firstText(
        input.descriptionConfig.salarySelectors ?? input.cardConfig.salarySelectors,
      ) ?? helpers.salaryFromText(pageText),
    title:
      helpers.firstText(
        input.descriptionConfig.titleSelectors ?? input.cardConfig.titleSelectors,
      ) ??
      helpers.firstText(["h1"]) ??
      helpers.titleFromText() ??
      helpers.lineBefore(input.descriptionConfig.titleLineBeforeMarker) ??
      "",
    truncated: normalizedDescription.length > input.maximumDescriptionCharacters,
    url: globalThis.location.href,
  };
}
