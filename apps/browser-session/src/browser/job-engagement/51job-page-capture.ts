import type { JobEngagementPageMetadata, JobEngagementPageCaptureLimits } from "./types.js";
import type { JobEngagementEvidence } from "@job-boardwalk/contracts";

interface Job51EngagementCaptureInput extends JobEngagementPageCaptureLimits {
  jobLinkOrigins: readonly string[];
  jobLinkPathPattern: string;
  salaryTextPattern: string;
}

// The callback stays self-contained because Patchright serializes it into the page realm.
// eslint-disable-next-line max-lines-per-function, complexity, max-statements -- One bounded pass owns linked 51job personal-center evidence.
export function capture51jobEngagementMetadata(
  input: Job51EngagementCaptureInput,
): JobEngagementPageMetadata {
  const { document } = globalThis;
  const firstIndex = 0;
  const increment = 1;
  const maximumAncestorDepth = 8;
  const maximumFieldCharacters = 300;
  const maximumAccessTextCharacters = 5000;
  const jobPath = new RegExp(input.jobLinkPathPattern, "u");
  const salaryPattern = new RegExp(input.salaryTextPattern, "u");
  const helpers = {
    company(container: Element): string {
      for (const link of container.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        try {
          const url = new URL(link.href, globalThis.location.href);
          if (
            input.jobLinkOrigins.includes(url.origin) &&
            !url.username &&
            !url.password &&
            /^\/[^/]+\/co[^/]+\.html$/u.test(url.pathname)
          ) {
            return helpers.normalized(link.textContent ?? "");
          }
        } catch {
          continue;
        }
      }
      return "";
    },
    container(link: HTMLAnchorElement): Element | null {
      let ancestor = link.parentElement;
      let depth = firstIndex;
      while (ancestor && depth < maximumAncestorDepth) {
        const jobs = [...ancestor.querySelectorAll<HTMLAnchorElement>("a[href]")].filter(
          (candidate) => helpers.jobUrl(candidate),
        );
        if (jobs.length > increment) {
          return null;
        }
        if (jobs.length === increment && helpers.company(ancestor)) {
          return ancestor;
        }
        ancestor = ancestor.parentElement;
        depth += increment;
      }
      return null;
    },
    jobUrl(link: HTMLAnchorElement): URL | null {
      try {
        const url = new URL(link.href, globalThis.location.href);
        return input.jobLinkOrigins.includes(url.origin) &&
          !url.username &&
          !url.password &&
          jobPath.test(url.pathname)
          ? url
          : null;
      } catch {
        return null;
      }
    },
    normalized(value: string, limit = maximumFieldCharacters): string {
      return value.replaceAll(/\s+/gu, " ").trim().slice(firstIndex, limit);
    },
  };
  const jobs: JobEngagementEvidence[] = [];
  const seen = new Set<string>();
  const collection = document.querySelector(
    globalThis.location.pathname === "/userset/my_collection" ? ".m-collect" : ".apox",
  );
  for (const link of collection?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? []) {
    const url = helpers.jobUrl(link);
    const identity = url ? jobPath.exec(url.pathname)?.groups?.["externalJobId"] : null;
    if (!url || !identity || seen.has(identity)) {
      continue;
    }
    const container = helpers.container(link);
    const title = helpers.normalized(link.textContent ?? "");
    if (!container || !title) {
      continue;
    }
    // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- Avoid hidden recruiter popovers in card summaries.
    const renderedSummary = (container as HTMLElement).innerText || "";
    const summary = helpers.normalized(renderedSummary, input.maximumSummaryCharacters);
    const company = helpers.company(container);
    const salaryText = salaryPattern.exec(summary)?.at(firstIndex);
    const location = helpers.normalized(container.querySelector(".dq")?.textContent ?? "");
    if (!summary) {
      continue;
    }
    seen.add(identity);
    if (jobs.length === input.maximumCards) {
      continue;
    }
    jobs.push({
      company,
      details: [],
      jobUrl: url.href,
      ...(location ? { location } : {}),
      ...(salaryText ? { salaryText } : {}),
      summary,
      title,
    });
  }
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- Visible heading and empty-state text establish category totals.
  const text = (document.body?.innerText ?? "").slice(firstIndex, maximumAccessTextCharacters);
  return { jobs, text, truncated: seen.size > input.maximumCards, url: globalThis.location.href };
}
