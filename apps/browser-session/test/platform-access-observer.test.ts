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

test("ignores an early navigation response whose frame does not exist yet", () => {
  const response = {
    ...fakeResponse({ finalUrl: "https://www.zhipin.com/web/geek/jobs" }),
    frame: () => {
      throw new Error("Frame for this navigation request is not available");
    },
  } as Response;

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
        text: "消息 简历 个人中心",
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
    text: "",
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
    text: "",
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
    text: "",
    url: "https://www.zhipin.com/beijing/",
  },
])("does not infer authentication from $name", ({ elements, text, url }) => {
  expect(derivePageAccessObservation({ elements, text, url })).toBeNull();
});

test.each(["搜索", "推荐", "添加求职期望"])(
  "observes an authenticated Yupao account identity with %s following it",
  (accountContext) => {
    expect(
      derivePageAccessObservation(
        {
          elements: [],
          text: [
            "首页",
            "职位",
            "公司",
            "校园",
            "意外险",
            "下载APP",
            "消息",
            "简历",
            "测试用户",
            accountContext,
            "全栈工程师",
          ].join("\n"),
          url: "https://www.yupao.com/topic/a2c1488/",
        },
        () => Date.parse(observedAt),
      ),
    ).toEqual({
      authenticationState: "authenticated",
      evidence: "authenticated-page",
      observedAt,
      platformId: "yupao",
    });
  },
);

test("observes an authenticated Yupao identity when a job title follows the account header", () => {
  expect(
    derivePageAccessObservation(
      {
        elements: [],
        text: [
          "首页",
          "职位",
          "公司",
          "校园",
          "意外险",
          "下载APP",
          "消息",
          "简历",
          "测试用户",
          "合成岗位标题",
        ].join("\n"),
        url: "https://www.yupao.com/zhaogong/123456789.html",
      },
      () => Date.parse(observedAt),
    ),
  ).toEqual({
    authenticationState: "authenticated",
    evidence: "authenticated-page",
    observedAt,
    platformId: "yupao",
  });
});

test("observes an authenticated Yupao identity on its personal-center page", () => {
  expect(
    derivePageAccessObservation(
      {
        elements: [],
        text: [
          "首页",
          "职位",
          "公司",
          "校园",
          "消息",
          "简历",
          "测试用户",
          "测试用户",
          "在线简历",
          "沟通过",
        ].join("\n"),
        url: "https://www.yupao.com/user/resume-info/?tab=2&subTab=1&mode=1",
      },
      () => Date.parse(observedAt),
    ),
  ).toEqual({
    authenticationState: "authenticated",
    evidence: "authenticated-page",
    observedAt,
    platformId: "yupao",
  });
});

test.each(["登录", "注册", "登录/注册", "立即登录", "免费注册"])(
  "does not treat Yupao's %s action as an authenticated identity",
  (identity) => {
    expect(
      derivePageAccessObservation({
        elements: [],
        text: ["首页", "职位", "公司", "校园", "消息", "简历", identity, "推荐"].join("\n"),
        url: "https://www.yupao.com/topic/a2c1488/",
      }),
    ).toBeNull();
  },
);

test("does not infer a Yupao account from a matching body-text sequence without header context", () => {
  expect(
    derivePageAccessObservation({
      elements: [],
      text: ["首页", "职位", "消息", "简历", "招聘顾问", "职位描述"].join("\n"),
      url: "https://www.yupao.com/topic/a2c1488/",
    }),
  ).toBeNull();
});
