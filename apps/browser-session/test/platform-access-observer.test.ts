import type { Frame, Request, Response } from "patchright";
import { expect, test } from "vitest";

import {
  deriveNavigationAccessObservation,
  derivePageAccessObservation,
} from "#/browser/platform-access-observer.js";

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
    deriveNavigationAccessObservation(
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
    deriveNavigationAccessObservation(
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
  expect(deriveNavigationAccessObservation(response)).toBeNull();
});

test("observes authenticated BOSS account navigation in a bounded page snapshot", () => {
  expect(
    derivePageAccessObservation(
      {
        elements: [
          {
            href: "https://www.zhipin.com/web/geek/chat",
          },
          {
            href: "https://www.zhipin.com/web/geek/resume",
          },
          {
            href: "https://www.zhipin.com/web/geek/recommend",
          },
        ],
        url: "https://www.zhipin.com/beijing/",
      },
      () => Date.parse(observedAt),
    ),
  ).toEqual({
    authenticationState: "authenticated",
    evidence: "authenticated-page",
    observedAt,
    platformId: "boss",
  });
});

test.each([
  {
    elements: [
      {
        href: "https://www.zhipin.com/web/geek/chat",
      },
      {
        href: "https://www.zhipin.com/web/geek/resume",
      },
    ],
    name: "an incomplete account navigation",
    url: "https://www.zhipin.com/beijing/",
  },
  {
    elements: [
      {
        href: "https://example.test/web/geek/chat",
      },
      {
        href: "https://example.test/web/geek/resume",
      },
      {
        href: "https://example.test/web/geek/recommend",
      },
    ],
    name: "lookalike links outside the platform",
    url: "https://www.zhipin.com/beijing/",
  },
  {
    elements: [
      {
        href: "http://www.zhipin.com/web/geek/chat",
      },
      {
        href: "http://www.zhipin.com/web/geek/resume",
      },
      {
        href: "http://www.zhipin.com/web/geek/recommend",
      },
    ],
    name: "insecure same-domain links",
    url: "https://www.zhipin.com/beijing/",
  },
])("does not infer authentication from $name", ({ elements, url }) => {
  expect(derivePageAccessObservation({ elements, url })).toBeNull();
});
