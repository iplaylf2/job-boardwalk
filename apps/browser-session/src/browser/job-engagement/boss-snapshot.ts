import type { JobEngagementEvidence } from "@job-boardwalk/contracts";

export interface BossJobEngagementMetadata {
  jobs: JobEngagementEvidence[];
  text: string;
  truncated: boolean;
  url: string;
}

// This callback is self-contained because Patchright serializes it into the page realm.
// eslint-disable-next-line complexity, max-lines-per-function, max-statements -- One bounded pass owns BOSS personal-center engagement extraction.
export function captureBossJobEngagementMetadata(): BossJobEngagementMetadata {
  const { document } = globalThis;
  const maximumCards = 200;
  const maximumAncestorDepth = 10;
  const maximumSummaryLength = 1500;
  const firstIndex = 0;
  const increment = 1;
  const salaryPattern = /\d+(?:-\d+)?K(?:·\d+薪)?|\d+(?:-\d+)?元\/(?:天|小时)|面议/u;
  const experiencePattern = /经验不限|在校\/应届|1年以内|1-3年|3-5年|5-10年|10年以上/u;
  const educationPattern = /学历不限|初中及以下|中专(?:\/中技)?|高中|大专|本科|硕士|博士/u;
  const jobPathPattern = /^\/job_detail\/(?<externalJobId>[^/]+)\.html$/u;
  const helpers = {
    normalized(value: string): string {
      return value.replaceAll(/\s+/gu, " ").trim();
    },
    rendered(element: Element): string {
      // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- Rendered card boundaries provide the summary.
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
  for (const { evidence, link } of uniqueLinks.slice(firstIndex, maximumCards)) {
    let container: Element = link;
    let ancestor: Element | null = link.parentElement;
    let depth = firstIndex;
    while (ancestor && depth < maximumAncestorDepth) {
      const semanticLinks = [...ancestor.querySelectorAll<HTMLAnchorElement>("a[href]")].filter(
        (candidate) => helpers.semanticJobLink(candidate) !== null,
      );
      const hasCompany = Boolean(ancestor.querySelector<HTMLAnchorElement>("a[href*='/gongsi/']"));
      if (
        semanticLinks.length === increment &&
        (hasCompany || salaryPattern.test(helpers.rendered(ancestor)))
      ) {
        container = ancestor;
        break;
      }
      ancestor = ancestor.parentElement;
      depth += increment;
    }
    const summary = helpers
      .normalized(helpers.rendered(container))
      .slice(firstIndex, maximumSummaryLength);
    const renderedTitle = helpers.normalized(helpers.rendered(link));
    const locationMatch = /\[(?<location>[^\]]+)\]\s*$/u.exec(renderedTitle);
    const location = locationMatch?.groups?.["location"]?.trim();
    const title = locationMatch
      ? renderedTitle.slice(firstIndex, locationMatch.index).trim()
      : renderedTitle;
    if (!title || !summary) {
      continue;
    }
    const company = helpers.normalized(
      container.querySelector<HTMLAnchorElement>("a[href*='/gongsi/']")?.textContent ?? "",
    );
    const salaryText = salaryPattern.exec(summary)?.at(firstIndex);
    const experienceRequirement = experiencePattern.exec(summary)?.at(firstIndex);
    const educationRequirement = educationPattern.exec(summary)?.at(firstIndex);
    jobs.push({
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
    });
  }
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- Rendered lines expose platform-maintained totals.
  const text = document.body?.innerText ?? "";
  return {
    jobs,
    text,
    truncated: uniqueLinks.length > maximumCards,
    url: globalThis.location.href,
  };
}
