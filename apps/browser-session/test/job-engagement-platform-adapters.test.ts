import { expect, test } from "vitest";
import {
  parsePlatformJobEngagementUrl,
  platformCatalog,
  platformIds,
  platformJobEngagementKinds,
} from "@job-boardwalk/platform-catalog";

import {
  jobEngagementPlatformAdapters,
  matchJobEngagementPage,
} from "#/browser/job-engagement/platform-adapters.js";

test("every platform adapter owns valid targets for every engagement category", () => {
  for (const platformId of platformIds) {
    const adapter = jobEngagementPlatformAdapters[platformId];
    for (const engagement of platformJobEngagementKinds) {
      const target = adapter.initialTarget(engagement);

      expect(adapter.platformId).toBe(platformId);
      expect(adapter.matchesTarget(target, target.url)).toBe(true);
      expect(parsePlatformJobEngagementUrl(platformId, target.url)).toBe(engagement);
      expect(matchJobEngagementPage(target.url)).toEqual({ adapter, engagement });
    }
  }
});

test("BOSS engagement targets preserve each live category's own filter contract", () => {
  const adapter = jobEngagementPlatformAdapters.boss;

  expect(
    Object.fromEntries(
      platformJobEngagementKinds.map((engagement) => [
        engagement,
        adapter.initialTarget(engagement).url,
      ]),
    ),
  ).toEqual({
    applied: "https://www.zhipin.com/web/geek/recommend?tab=2&page=1&tag=5",
    contacted: "https://www.zhipin.com/web/geek/recommend?tab=1&page=1&tag=5",
    interested: "https://www.zhipin.com/web/geek/recommend?tab=4&sub=1&page=1&tag=4",
    interviewed: "https://www.zhipin.com/web/geek/recommend?tab=3&page=1&tag=5",
  });
});

test("platform continuation capability follows catalog pagination metadata", () => {
  for (const platformId of platformIds) {
    const adapter = jobEngagementPlatformAdapters[platformId];
    const target = adapter.initialTarget("contacted");
    const continuation = adapter.nextTarget(target);
    const { pagination } = platformCatalog[platformId].web.jobEngagement;

    if (pagination) {
      if (!continuation) {
        expect.unreachable("声明分页能力的平台必须提供后续目标");
      }
      expect(adapter.matchesTarget(continuation, continuation.url)).toBe(true);
      expect(adapter.matchesTarget(target, continuation.url)).toBe(false);
      expect(continuation.url).not.toBe(target.url);
    } else {
      expect(continuation).toBeNull();
    }
  }
});
