import type { PlatformAccessAssessment } from "@job-boardwalk/contracts";

import type { PlatformPageRules } from "./platform-page-rules.js";

const accessDenialLanguage =
  /(?:access\s+denied|forbidden|request\s+blocked|拒绝访问|访问(?:已)?受限|请求被拦截|账号(?:已)?封禁)/iu;
const verificationLanguage =
  /(?:captcha|verify|verification|人机验证|安全验证|异常访问|完成验证|滑块验证|验证码)/iu;
const loginLanguage = /(?:log\s*in|sign\s*in|登录|手机号登录|扫码登录)/iu;
export interface PlatformPageSnapshot {
  accountIdentityVisible: boolean;
  verificationControlVisible: boolean;
  loginControlVisible: boolean;
  text: string;
  title: string;
  url: URL;
}

export interface PlatformAccessAssessmentInput {
  rules: PlatformPageRules;
  snapshot: PlatformPageSnapshot;
}

function pathStartsWith(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

export function assessPlatformAccess({
  rules,
  snapshot,
}: PlatformAccessAssessmentInput): PlatformAccessAssessment | null {
  if (accessDenialLanguage.test(`${snapshot.title} ${snapshot.text}`)) {
    return { evidence: "access-denied-page", interruption: "access-denied" };
  }
  if (
    snapshot.verificationControlVisible ||
    verificationLanguage.test(`${snapshot.title} ${snapshot.text}`)
  ) {
    return { evidence: "verification-page", interruption: "verification-required" };
  }
  if (
    pathStartsWith(snapshot.url.pathname, rules.loginPathPrefixes) ||
    (snapshot.loginControlVisible && loginLanguage.test(`${snapshot.title} ${snapshot.text}`))
  ) {
    return { authenticationState: "unauthenticated", evidence: "login-page" };
  }
  if (snapshot.accountIdentityVisible) {
    return {
      authenticationState: "authenticated",
      evidence: "account-identity",
    };
  }
  return null;
}
