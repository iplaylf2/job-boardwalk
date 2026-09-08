import type { Page } from "patchright";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import type {
  JobEngagementPageMetadata,
  JobEngagementPlatformAdapter,
  JobEngagementTarget,
} from "./types.js";
import { bossPageDefinition } from "#/browser/platforms/boss.js";
import {
  parsePlatformJobEngagementUrl,
  parsePlatformWebUrl,
  platformCatalog,
  platformIds,
  resolvePlatformJobEngagementUrl,
} from "@job-boardwalk/platform-catalog";
import type { PlatformId, PlatformJobEngagementKind } from "@job-boardwalk/platform-catalog";

import { capture51jobEngagementMetadata } from "./51job-page-capture.js";
import { job51EvidenceConfig } from "#/browser/platforms/51job.js";
import { parseJobEngagementTotal, parse51jobEngagementTotal } from "./page-totals.js";
import { captureBossJobEngagementMetadata } from "./boss-page-capture.js";
import { maximumJobsPerEngagementScan } from "./scan-limit.js";
import { captureYupaoJobEngagementMetadata } from "./yupao-page-capture.js";

const maximumSummaryCharacters = 1500;
const nextPageIncrement = 1;
const pageCaptureLimits = {
  maximumCards: maximumJobsPerEngagementScan,
  maximumSummaryCharacters,
};

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

function createEngagementAdapter(
  platformId: PlatformId,
  capturePage: JobEngagementPlatformAdapter["capturePage"],
  readTotal: JobEngagementPlatformAdapter["readTotal"],
): JobEngagementPlatformAdapter {
  const { pagination } = platformCatalog[platformId].web.jobEngagement;
  return {
    capturePage,
    initialTarget: (engagement) => initialTarget(platformId, engagement),
    matchesTarget: (target, value) => matchesTarget(platformId, target, value),
    nextTarget(target) {
      if (!pagination) {
        return null;
      }
      const url = new URL(target.url);
      const page = Number(url.searchParams.get(pagination.parameter));
      url.searchParams.set(pagination.parameter, String(page + nextPageIncrement));
      return { ...target, url: url.href };
    },
    platformId,
    readTotal,
  };
}

function* captureBossPageMetadata(page: Page): RiteCoroutine<JobEngagementPageMetadata> {
  return yield* until(() =>
    page.evaluate(captureBossJobEngagementMetadata, {
      ...pageCaptureLimits,
      ...bossPageDefinition.jobLink,
    }),
  );
}

function* captureYupaoPageMetadata(page: Page): RiteCoroutine<JobEngagementPageMetadata> {
  return yield* until(() => page.evaluate(captureYupaoJobEngagementMetadata, pageCaptureLimits));
}

function* capture51jobPageMetadata(page: Page): RiteCoroutine<JobEngagementPageMetadata> {
  return yield* until(() =>
    page.evaluate(capture51jobEngagementMetadata, {
      ...pageCaptureLimits,
      jobLinkOrigins: job51EvidenceConfig.jobLinkOrigins,
      jobLinkPathPattern: job51EvidenceConfig.jobLinkPathPattern,
      salaryTextPattern: job51EvidenceConfig.salaryTextPattern,
    }),
  );
}

export const jobEngagementPlatformAdapters = {
  "51job": createEngagementAdapter("51job", capture51jobPageMetadata, parse51jobEngagementTotal),
  boss: createEngagementAdapter("boss", captureBossPageMetadata, parseJobEngagementTotal),
  yupao: createEngagementAdapter("yupao", captureYupaoPageMetadata, parseJobEngagementTotal),
} as const satisfies Record<PlatformId, JobEngagementPlatformAdapter>;

export function matchJobEngagementPage(value: string): {
  adapter: JobEngagementPlatformAdapter;
  engagement: PlatformJobEngagementKind;
} | null {
  for (const platformId of platformIds) {
    const engagement = parsePlatformJobEngagementUrl(platformId, value);
    const adapter = jobEngagementPlatformAdapters[platformId];
    if (engagement) {
      return { adapter, engagement };
    }
  }
  return null;
}

export function isJobEngagementPage(platformId: PlatformId, value: string): boolean {
  return matchJobEngagementPage(value)?.adapter.platformId === platformId;
}
