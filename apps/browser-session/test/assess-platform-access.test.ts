import { expect, test } from "vitest";

import { assessPlatformAccess } from "#/platform-access/assess-platform-access.js";
import { platformPageRules } from "#/platform-access/platform-page-rules.js";

function createSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    accountIdentityVisible: false,
    loginControlVisible: false,
    text: "",
    title: "BOSS直聘",
    url: new URL("https://www.zhipin.com/"),
    verificationControlVisible: false,
    ...overrides,
  };
}

test("assesses semantic verification pages without depending on an exact route", () => {
  for (const url of [
    "https://www.zhipin.com/arbitrary/new/challenge/location",
    "https://www.zhipin.com/another/future/checkpoint",
  ]) {
    const pageUrl = new URL(url);
    const result = assessPlatformAccess({
      rules: platformPageRules.boss,
      snapshot: createSnapshot({ text: "检测到异常访问，请完成安全验证", url: pageUrl }),
    });
    expect(result).toEqual({
      evidence: "verification-page",
      interruption: "verification-required",
    });
  }
});

test("recognizes a visible verification control", () => {
  expect(
    assessPlatformAccess({
      rules: platformPageRules.boss,
      snapshot: createSnapshot({ verificationControlVisible: true }),
    }),
  ).toEqual({ evidence: "verification-page", interruption: "verification-required" });
});

test("recognizes semantic access denial", () => {
  expect(
    assessPlatformAccess({
      rules: platformPageRules.boss,
      snapshot: createSnapshot({ text: "当前请求被拦截，请稍后再试" }),
    }),
  ).toEqual({ evidence: "access-denied-page", interruption: "access-denied" });
});

test("distinguishes login and authenticated pages", () => {
  const loginUrl = new URL("https://www.zhipin.com/web/user/");
  const loginResult = assessPlatformAccess({
    rules: platformPageRules.boss,
    snapshot: createSnapshot({ loginControlVisible: true, text: "手机号登录", url: loginUrl }),
  });
  expect(loginResult).toEqual({ authenticationState: "unauthenticated", evidence: "login-page" });

  const accountUrl = new URL("https://www.zhipin.com/web/geek/job-recommend");
  const authenticatedResult = assessPlatformAccess({
    rules: platformPageRules.boss,
    snapshot: createSnapshot({ accountIdentityVisible: true, url: accountUrl }),
  });
  expect(authenticatedResult).toEqual({
    authenticationState: "authenticated",
    evidence: "account-identity",
  });
});

test("treats an SMS code as login evidence rather than a verification interruption", () => {
  const loginUrl = new URL("https://www.zhipin.com/web/user/");
  expect(
    assessPlatformAccess({
      rules: platformPageRules.boss,
      snapshot: createSnapshot({
        loginControlVisible: true,
        text: "手机号登录 获取验证码",
        url: loginUrl,
      }),
    }),
  ).toEqual({ authenticationState: "unauthenticated", evidence: "login-page" });
});

test("requires visible login evidence and prefers a visible account identity", () => {
  const loginUrl = new URL("https://www.zhipin.com/web/user/");
  expect(
    assessPlatformAccess({
      rules: platformPageRules.boss,
      snapshot: createSnapshot({ url: loginUrl }),
    }),
  ).toBeNull();
  expect(
    assessPlatformAccess({
      rules: platformPageRules.boss,
      snapshot: createSnapshot({
        accountIdentityVisible: true,
        loginControlVisible: true,
        text: "登录",
      }),
    }),
  ).toEqual({ authenticationState: "authenticated", evidence: "account-identity" });
});
