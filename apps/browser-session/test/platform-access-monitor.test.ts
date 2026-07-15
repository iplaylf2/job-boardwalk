import type { Frame, Request, Response } from "patchright";
import { expect, test } from "vitest";

import { derivePlatformAccessObservation } from "#/browser/platform-access-monitor.js";

const emptyUrlCount = 0;

function fakeRequest(urls: string[], isNavigationRequest = true): Request {
  const [url, ...remainingUrls] = urls;
  return {
    isNavigationRequest: () => isNavigationRequest,
    redirectedFrom: () =>
      remainingUrls.length > emptyUrlCount ? fakeRequest(remainingUrls) : null,
    url: () => url,
  } as unknown as Request;
}

function fakeResponse(options: {
  finalUrl: string;
  ok?: boolean;
  parentFrame?: Frame | null;
  redirectedFromUrls?: string[];
}): Response {
  return {
    frame: () => ({ parentFrame: () => options.parentFrame ?? null }) as unknown as Frame,
    ok: () => options.ok ?? true,
    request: () => fakeRequest([options.finalUrl, ...(options.redirectedFromUrls ?? [])]),
    url: () => options.finalUrl,
  } as unknown as Response;
}

const observedAt = "2026-07-15T02:00:00.000Z";

test("observes a successful BOSS protected-page navigation as authenticated", () => {
  expect(
    derivePlatformAccessObservation(
      fakeResponse({ finalUrl: "https://www.zhipin.com/web/geek/jobs" }),
      () => Date.parse(observedAt),
    ),
  ).toEqual({
    authenticationState: "authenticated",
    evidence: "protected-resource",
    observedAt,
    platformId: "boss",
  });
});

test("observes a protected BOSS navigation redirected to login as unauthenticated", () => {
  expect(
    derivePlatformAccessObservation(
      fakeResponse({
        finalUrl: "https://www.zhipin.com/web/user/?ka=header-login",
        redirectedFromUrls: ["https://www.zhipin.com/web/geek/recommend"],
      }),
      () => Date.parse(observedAt),
    ),
  ).toEqual({
    authenticationState: "unauthenticated",
    evidence: "login-redirect",
    observedAt,
    platformId: "boss",
  });
});

test.each([
  ["a login page opened directly", fakeResponse({ finalUrl: "https://www.zhipin.com/web/user/" })],
  [
    "a subframe navigation",
    fakeResponse({
      finalUrl: "https://www.zhipin.com/web/geek/jobs",
      parentFrame: {} as Frame,
    }),
  ],
  [
    "a non-navigation response",
    {
      ...fakeResponse({ finalUrl: "https://www.zhipin.com/web/geek/jobs" }),
      request: () => fakeRequest(["https://www.zhipin.com/web/geek/jobs"], false),
    } as Response,
  ],
  [
    "an unsuccessful protected response",
    fakeResponse({ finalUrl: "https://www.zhipin.com/web/geek/jobs", ok: false }),
  ],
])("ignores %s", (_description, response) => {
  expect(derivePlatformAccessObservation(response)).toBeNull();
});
