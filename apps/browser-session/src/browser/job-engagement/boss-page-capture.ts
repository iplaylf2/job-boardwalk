import type { JobEngagementEvidence } from "@job-boardwalk/contracts";

import type { JobEngagementPageMetadata, JobEngagementPageCaptureLimits } from "./types.js";

interface BossJobEngagementCaptureInput extends JobEngagementPageCaptureLimits {
  jobLinkPathPattern: string;
}

// This callback is self-contained because Patchright serializes it into the page realm.
// eslint-disable-next-line max-lines-per-function -- The serialized page callback must contain its helpers; each helper remains subject to complexity and size checks.
export function captureBossJobEngagementMetadata(
  input: BossJobEngagementCaptureInput,
): JobEngagementPageMetadata {
  const { document } = globalThis;
  const maximumAncestorDepth = 10;
  const firstIndex = 0;
  const increment = 1;
  const salaryPattern = /\d+(?:-\d+)?K(?:·\d+薪)?|\d+(?:-\d+)?元\/(?:天|小时)|面议/u;
  const experiencePattern = /经验不限|在校\/应届|1年以内|1-3年|3-5年|5-10年|10年以上/u;
  const educationPattern = /学历不限|初中及以下|中专(?:\/中技)?|高中|大专|本科|硕士|博士/u;
  const jobPathPattern = new RegExp(input.jobLinkPathPattern, "u");
  const helpers = {
    findCardContainer(link: HTMLAnchorElement): Element {
      let ancestor: Element | null = link.parentElement;
      let depth = firstIndex;
      while (ancestor && depth < maximumAncestorDepth) {
        const semanticLinks = [...ancestor.querySelectorAll<HTMLAnchorElement>("a[href]")].filter(
          (candidate) => helpers.semanticJobLink(candidate) !== null,
        );
        const hasCompany = Boolean(
          ancestor.querySelector<HTMLAnchorElement>("a[href*='/gongsi/']"),
        );
        if (
          semanticLinks.length === increment &&
          (hasCompany || salaryPattern.test(helpers.rendered(ancestor)))
        ) {
          return ancestor;
        }
        ancestor = ancestor.parentElement;
        depth += increment;
      }
      return link;
    },
    normalized(value: string): string {
      return value.replaceAll(/\s+/gu, " ").trim();
    },
    readCard(
      link: HTMLAnchorElement,
      evidence: { externalJobId: string; href: string },
    ): JobEngagementEvidence | null {
      const container = helpers.findCardContainer(link);
      const summary = helpers
        .normalized(helpers.rendered(container))
        .slice(firstIndex, input.maximumSummaryCharacters);
      const renderedTitle = helpers.normalized(helpers.rendered(link));
      const locationMatch = /\[(?<location>[^\]]+)\]\s*$/u.exec(renderedTitle);
      const location = locationMatch?.groups?.["location"]?.trim();
      const title = locationMatch
        ? renderedTitle.slice(firstIndex, locationMatch.index).trim()
        : renderedTitle;
      if (!title || !summary) {
        return null;
      }
      const company = helpers.normalized(
        container.querySelector<HTMLAnchorElement>("a[href*='/gongsi/']")?.textContent ?? "",
      );
      const salaryText = salaryPattern.exec(summary)?.at(firstIndex);
      const experienceRequirement = experiencePattern.exec(summary)?.at(firstIndex);
      const educationRequirement = educationPattern.exec(summary)?.at(firstIndex);
      return {
        ...(company ? { company } : {}),
        details: [],
        ...(educationRequirement ? { educationRequirement } : {}),
        ...(experienceRequirement ? { experienceRequirement } : {}),
        externalJobId: evidence.externalJobId,
        jobUrl: evidence.href,
        ...(location ? { location } : {}),
        ...(salaryText ? { salaryText } : {}),
        summary,
        title,
      };
    },
    rendered(element: Element): string {
      return (element as HTMLElement).innerText || element.textContent || "";
    },
    semanticJobLink(link: HTMLAnchorElement): { externalJobId: string; href: string } | null {
      const href = (() => {
        try {
          return new URL(link.href, globalThis.location.href);
        } catch {
          return null;
        }
      })();
      if (!href) {
        return null;
      }
      const externalJobId = jobPathPattern.exec(href.pathname)?.groups?.["externalJobId"];
      const marker = href.searchParams.get("ka");
      return href.origin === globalThis.location.origin &&
        externalJobId &&
        marker?.startsWith("personal_") &&
        marker.endsWith(`_job_${externalJobId}`)
        ? { externalJobId, href: href.href }
        : null;
    },
  };
  const links = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
    .map((link) => ({ evidence: helpers.semanticJobLink(link), link }))
    .filter(
      (
        entry,
      ): entry is {
        evidence: { externalJobId: string; href: string };
        link: HTMLAnchorElement;
      } => entry.evidence !== null,
    );
  const uniqueLinks = [
    ...new Map(links.map((entry) => [entry.evidence.externalJobId, entry])).values(),
  ];
  const jobs: JobEngagementEvidence[] = [];
  for (const { evidence, link } of uniqueLinks.slice(firstIndex, input.maximumCards)) {
    const job = helpers.readCard(link, evidence);
    if (job) {
      jobs.push(job);
    }
  }
  const text = document.body?.innerText ?? "";
  return {
    jobs,
    text,
    truncated: uniqueLinks.length > input.maximumCards,
    url: globalThis.location.href,
  };
}
