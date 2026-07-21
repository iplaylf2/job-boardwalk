import { expect, test } from "vitest";

import { BrowserSessionPresenceTracker } from "#/runtime/browser-session-presence.js";

const leaseMilliseconds = 15_000;

test("expires browser session reports instead of presenting stale state as current", () => {
  let now = Date.parse("2026-07-15T01:00:00.000Z");
  const tracker = new BrowserSessionPresenceTracker(() => now, leaseMilliseconds);

  expect(tracker.presence).toEqual({ state: "unknown" });
  expect(tracker.receive({ available: true, browserVersion: "149.0", tabCount: 1 })).toEqual({
    browserStatus: { available: true, browserVersion: "149.0", tabCount: 1 },
    leaseExpiresAt: "2026-07-15T01:00:15.000Z",
    receivedAt: "2026-07-15T01:00:00.000Z",
    state: "online",
  });

  now += leaseMilliseconds;

  expect(tracker.presence).toEqual({
    lastBrowserStatus: { available: true, browserVersion: "149.0", tabCount: 1 },
    lastReceivedAt: "2026-07-15T01:00:00.000Z",
    state: "offline",
  });
});
