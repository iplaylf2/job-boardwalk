import type { Page } from "patchright";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import type { JobEngagementEvidence } from "@job-boardwalk/contracts";
import {
  parsePlatformJobEngagementUrl,
  parsePlatformWebUrl,
  platformCatalog,
  platformIds,
  resolvePlatformJobEngagementUrl,
} from "@job-boardwalk/platform-catalog";
import type { PlatformId, PlatformJobEngagementKind } from "@job-boardwalk/platform-catalog";

import { captureBossJobEngagementMetadata } from "./boss-page-capture.js";
import { maximumJobsPerEngagementScan } from "./scan-limit.js";
import { captureYupaoJobEngagementMetadata } from "./yupao-page-capture.js";

const maximumSummaryCharacters = 1500;
const nextPageIncrement = 1;
const pageCaptureLimits = {
  maximumCards: maximumJobsPerEngagementScan,
  maximumSummaryCharacters,
};

export interface JobEngagementPageMetadata {
  jobs: JobEngagementEvidence[];
  text: string;
  truncated: boolean;
  url: string;
}

export interface JobEngagementTarget {
  engagement: PlatformJobEngagementKind;
  url: string;
}

export interface JobEngagementPlatformAdapter {
  capturePage: (page: Page) => RiteCoroutine<JobEngagementPageMetadata>;
  initialTarget: (engagement: PlatformJobEngagementKind) => JobEngagementTarget;
  matchesTarget: (target: JobEngagementTarget, value: string) => boolean;
  nextTarget: (target: JobEngagementTarget) => JobEngagementTarget | null;
  platformId: PlatformId;
}

function matchesTarget(
  platformId: PlatformId,
  target: JobEngagementTarget,
  value: string,
): boolean {
  const candidate = parsePlatformWebUrl(platformId, value);
  const expected = new URL(target.url);
  return Boolean(
    candidate &&
    parsePlatformJobEngagementUrl(platformId, value) === target.engagement &&
    candidate.pathname === expected.pathname &&
    [...expected.searchParams].every(
      ([name, expectedValue]) => candidate.searchParams.get(name) === expectedValue,
    ),
  );
}

function initialTarget(
  platformId: PlatformId,
  engagement: PlatformJobEngagementKind,
): JobEngagementTarget {
  return {
    engagement,
    url: resolvePlatformJobEngagementUrl(platformId, engagement),
  };
}

function bossPageTarget(engagement: PlatformJobEngagementKind, page: number): JobEngagementTarget {
  const target = initialTarget("boss", engagement);
  const url = new URL(target.url);
  const { parameter } = platformCatalog.boss.web.jobEngagement.pagination;
  url.searchParams.set(parameter, String(page));
  return { ...target, url: url.href };
}

function* captureBossPageMetadata(page: Page): RiteCoroutine<JobEngagementPageMetadata> {
  return yield* until(() => page.evaluate(captureBossJobEngagementMetadata, pageCaptureLimits));
}

function* captureYupaoPageMetadata(page: Page): RiteCoroutine<JobEngagementPageMetadata> {
  const metadata = yield* until(() =>
    page.evaluate(captureYupaoJobEngagementMetadata, pageCaptureLimits),
  );
  return {
    jobs: metadata.cards,
    text: metadata.text,
    truncated: metadata.truncated,
    url: metadata.url,
  };
}

export const jobEngagementPlatformAdapters = {
  boss: {
    capturePage: captureBossPageMetadata,
    initialTarget: (engagement) =>
      bossPageTarget(engagement, platformCatalog.boss.web.jobEngagement.pagination.firstPage),
    matchesTarget: (target, value) => matchesTarget("boss", target, value),
    nextTarget(target) {
      const { parameter } = platformCatalog.boss.web.jobEngagement.pagination;
      const page = Number(new URL(target.url).searchParams.get(parameter));
      return bossPageTarget(target.engagement, page + nextPageIncrement);
    },
    platformId: "boss",
  },
  yupao: {
    capturePage: captureYupaoPageMetadata,
    initialTarget: (engagement) => initialTarget("yupao", engagement),
    matchesTarget: (target, value) => matchesTarget("yupao", target, value),
    nextTarget: () => null,
    platformId: "yupao",
  },
} as const satisfies Record<PlatformId, JobEngagementPlatformAdapter>;

export function matchJobEngagementPage(value: string): {
  adapter: JobEngagementPlatformAdapter;
  engagement: PlatformJobEngagementKind;
} | null {
  for (const platformId of platformIds) {
    const engagement = parsePlatformJobEngagementUrl(platformId, value);
    if (engagement) {
      return { adapter: jobEngagementPlatformAdapters[platformId], engagement };
    }
  }
  return null;
}

export function isJobEngagementPage(platformId: PlatformId, value: string): boolean {
  return matchJobEngagementPage(value)?.adapter.platformId === platformId;
}
