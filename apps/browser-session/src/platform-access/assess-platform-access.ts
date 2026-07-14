import type { PlatformAccessAssessment } from "@job-boardwalk/contracts";

import type { PlatformPageRules } from "./platform-page-rules.js";

const accessDenialTitle =
  /(?:access\s+denied|request\s+blocked|拒绝访问|访问(?:已)?受限|请求被拦截|账号已封禁)/iu;
const accessDenialMessage =
  /(?:当前请求被拦截|您的?访问(?:已)?受限|请求因.{0,30}被拦截|账号已封禁)/iu;
const verificationTitle =
  /(?:captcha|human\s+verification|security\s+verification|人机验证|安全验证|滑块验证)/iu;
const verificationMessage =
  /(?:检测到异常访问.{0,50}(?:完成|进行).{0,10}验证|请完成(?:安全|人机|滑块)验证|拖动.{0,20}滑块.{0,20}验证)/iu;
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
  if (accessDenialTitle.test(snapshot.title) || accessDenialMessage.test(snapshot.text)) {
    return { evidence: "access-denied-page", interruption: "access-denied" };
  }
  if (
    snapshot.verificationControlVisible ||
    verificationTitle.test(snapshot.title) ||
    verificationMessage.test(snapshot.text)
  ) {
    return { evidence: "verification-page", interruption: "verification-required" };
  }
  if (snapshot.accountIdentityVisible) {
    return {
      authenticationState: "authenticated",
      evidence: "account-identity",
    };
  }
  if (
    snapshot.loginControlVisible &&
    (pathStartsWith(snapshot.url.pathname, rules.loginPathPrefixes) ||
      loginLanguage.test(`${snapshot.title} ${snapshot.text}`))
  ) {
    return { authenticationState: "unauthenticated", evidence: "login-page" };
  }
  return null;
}
