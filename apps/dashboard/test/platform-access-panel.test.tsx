import { renderToString } from "@solidjs/web";
import { expect, test } from "vitest";

import { PlatformAccessPanel } from "#/platform-access-panel.js";

test("dates authentication evidence by its latest confirmation", () => {
  const html = renderToString(() => (
    <PlatformAccessPanel
      platforms={[
        {
          label: "示例招聘平台",
          latestAuthentication: {
            authenticationState: "authenticated",
            evidence: "protected-resource",
            id: 1,
            lastObservedAt: "2026-08-17T02:05:00.000Z",
            observedAt: "2026-08-17T01:30:00.000Z",
            platformId: "boss",
          },
          platformId: "boss",
        },
      ]}
    />
  ));

  expect(html).toContain('datetime="2026-08-17T02:05:00.000Z"');
});

test("presents the latest recurrence of an unresolved interruption", () => {
  const html = renderToString(() => (
    <PlatformAccessPanel
      platforms={[
        {
          label: "示例招聘平台",
          platformId: "yupao",
          unresolvedInterruption: {
            evidence: "verification-page",
            id: 2,
            interruption: "verification-required",
            lastObservedAt: "2026-08-17T02:10:00.000Z",
            observedAt: "2026-08-17T01:45:00.000Z",
            platformId: "yupao",
          },
        },
      ]}
    />
  ));

  expect(html).toContain('datetime="2026-08-17T02:10:00.000Z"');
});
