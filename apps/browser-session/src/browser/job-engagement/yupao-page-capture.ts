import type { JobEngagementEvidence } from "@job-boardwalk/contracts";

export interface YupaoJobEngagementMetadata {
  cards: JobEngagementEvidence[];
  text: string;
  truncated: boolean;
  url: string;
}

interface JobEngagementPageCaptureLimits {
  maximumCards: number;
  maximumSummaryCharacters: number;
}

// This callback is self-contained because Patchright serializes it into the page realm.
// eslint-disable-next-line complexity, max-lines-per-function, max-statements -- One bounded pass extracts non-link Yupao engagement cards.
export function captureYupaoJobEngagementMetadata(
  input: JobEngagementPageCaptureLimits,
): YupaoJobEngagementMetadata {
  const { document } = globalThis;
  const salaryPattern =
    /^\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?万元\/月$|^\d+(?:-\d+)?元\/(?:月|天|小时)$|^(?:薪资面议|面议)$/u;
  const experiencePattern = /^(?:经验不限|在校\/应届|1年以内|1-3年|3-5年|5-10年|10年以上)$/u;
  const educationPattern = /^(?:学历不限|初中及以下|中专(?:\/中技)?|高中|大专|本科|硕士|博士)$/u;
  const financingPattern =
    /^(?:不需要融资|未融资|天使轮|Pre-A轮|A轮|A\+轮|B轮|B\+轮|C轮|D轮及以上|已上市|上市公司)$/u;
  const startIndex = 0;
  const increment = 1;
  const maximumAncestorDepth = 9;
  const maximumLines = 40;
  const minimumCardLines = 5;
  const titleLineOffset = 2;
  const helpers = {
    lines(element: Element): string[] {
      // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- Rendered block boundaries define card fields.
      return ((element as HTMLElement).innerText || element.textContent || "")
        .split(/\r?\n/u)
        .map((line) => line.replaceAll(/\s+/gu, " ").trim())
        .filter(Boolean);
    },
    matchingSalaryCount(lines: string[]): number {
      return lines.filter((line) => salaryPattern.test(line)).length;
    },
  };
  const candidates: Element[] = [];
  for (const element of document.querySelectorAll<HTMLElement>("body *")) {
    const ownText = (element.textContent ?? "").replaceAll(/\s+/gu, " ").trim();
    if (!salaryPattern.test(ownText)) {
      continue;
    }
    let ancestor = element.parentElement;
    let depth = startIndex;
    while (ancestor && depth < maximumAncestorDepth) {
      const lines = helpers.lines(ancestor);
      const salaryIndex = lines.findIndex((line) => salaryPattern.test(line));
      const hasLocationBeforeSalary =
        salaryIndex > startIndex && /^\[.+\]$/u.test(lines[salaryIndex - increment] ?? "");
      const hasCompanyMetadata = lines.some((line) => financingPattern.test(line));
      if (
        lines.length >= minimumCardLines &&
        lines.length <= maximumLines &&
        helpers.matchingSalaryCount(lines) === increment &&
        hasLocationBeforeSalary &&
        hasCompanyMetadata
      ) {
        candidates.push(ancestor);
        break;
      }
      ancestor = ancestor.parentElement;
      depth += increment;
    }
  }

  const uniqueCandidates = candidates.filter(
    (candidate, index, values) =>
      values.indexOf(candidate) === index &&
      !values.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          candidate.contains(other) &&
          helpers.matchingSalaryCount(helpers.lines(other)) === increment,
      ),
  );
  const cards: JobEngagementEvidence[] = [];
  for (const candidate of uniqueCandidates.slice(startIndex, input.maximumCards)) {
    const lines = helpers.lines(candidate);
    const salaryIndex = lines.findIndex((line) => salaryPattern.test(line));
    const location = lines[salaryIndex - increment]?.replace(/^\[(?<value>.*)\]$/u, "$<value>");
    const title = lines[salaryIndex - titleLineOffset];
    if (!title || !location) {
      continue;
    }
    const experienceRequirement = lines
      .slice(salaryIndex + increment)
      .find((line) => experiencePattern.test(line));
    const educationRequirement = lines
      .slice(salaryIndex + increment)
      .find((line) => educationPattern.test(line));
    const financingIndex = lines.findIndex(
      (line, index) => index > salaryIndex && financingPattern.test(line),
    );
    const company =
      financingIndex > salaryIndex + increment ? lines[financingIndex - increment] : "";
    const link = candidate.querySelector<HTMLAnchorElement>("a[href*='/zhaogong/']");
    const detailsEnd = financingIndex > salaryIndex ? financingIndex - increment : lines.length;
    const details = lines
      .slice(salaryIndex + increment, detailsEnd)
      .filter(
        (line) =>
          line !== experienceRequirement &&
          line !== educationRequirement &&
          line !== company &&
          !/^\d+-\d+人$|^\d+人以上$/u.test(line),
      );
    cards.push({
      ...(company ? { company } : {}),
      details: [...new Set(details)],
      ...(educationRequirement ? { educationRequirement } : {}),
      ...(experienceRequirement ? { experienceRequirement } : {}),
      ...(link ? { jobUrl: link.href } : {}),
      location,
      salaryText: lines[salaryIndex]!,
      summary: lines.join(" ").slice(startIndex, input.maximumSummaryCharacters),
      title,
    });
  }
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- Rendered lines expose the platform count.
  const text = document.body?.innerText ?? "";
  return {
    cards,
    text,
    truncated: uniqueCandidates.length > input.maximumCards,
    url: globalThis.location.href,
  };
}
