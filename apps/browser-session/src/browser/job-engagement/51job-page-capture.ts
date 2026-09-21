import type { JobEngagementPageMetadata, JobEngagementPageCaptureLimits } from "./types.js";
import type { JobEngagementEvidence } from "@job-boardwalk/contracts";

interface Job51EngagementCaptureInput extends JobEngagementPageCaptureLimits {
  jobLinkOrigins: readonly string[];
  jobLinkPathPattern: string;
  salaryTextPattern: string;
}

// The callback stays self-contained because Patchright serializes it into the page realm.
// eslint-disable-next-line max-lines-per-function -- The serialized page callback must contain its helpers; each helper remains subject to complexity and size checks.
export function capture51jobEngagementMetadata(
  input: Job51EngagementCaptureInput,
): JobEngagementPageMetadata {
  const { document } = globalThis;
  const firstIndex = 0;
  const increment = 1;
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
    findCardContainer(link: HTMLAnchorElement): Element | null {
      const maximumAncestorDepth = 8;
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
    readCard(link: HTMLAnchorElement): { identity: string; job: JobEngagementEvidence } | null {
      const url = helpers.jobUrl(link);
      const identity = url ? jobPath.exec(url.pathname)?.groups?.["externalJobId"] : null;
      if (!url || !identity || seen.has(identity)) {
        return null;
      }
      const container = helpers.findCardContainer(link);
      const title = helpers.normalized(link.textContent ?? "");
      if (!container || !title) {
        return null;
      }
      const renderedSummary = (container as HTMLElement).innerText || "";
      const summary = helpers.normalized(renderedSummary, input.maximumSummaryCharacters);
      const company = helpers.company(container);
      const salaryText = salaryPattern.exec(summary)?.at(firstIndex);
      const location = helpers.normalized(container.querySelector(".dq")?.textContent ?? "");
      if (!summary) {
        return null;
      }
      return {
        identity,
        job: {
          company,
          details: [],
          jobUrl: url.href,
          ...(location ? { location } : {}),
          ...(salaryText ? { salaryText } : {}),
          summary,
          title,
        },
      };
    },
  };
  const jobs: JobEngagementEvidence[] = [];
  const seen = new Set<string>();
  const collection = document.querySelector(
    globalThis.location.pathname === "/userset/my_collection" ? ".m-collect" : ".apox",
  );
  for (const link of collection?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? []) {
    const captured = helpers.readCard(link);
    if (!captured) {
      continue;
    }
    seen.add(captured.identity);
    if (jobs.length < input.maximumCards) {
      jobs.push(captured.job);
    }
  }
  const text = (document.body?.innerText ?? "").slice(firstIndex, maximumAccessTextCharacters);
  return { jobs, text, truncated: seen.size > input.maximumCards, url: globalThis.location.href };
}
