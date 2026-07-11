import type { AuthenticationEvidence } from "./login/evidence.js";

interface PlatformDefinition {
  authenticationEvidence: AuthenticationEvidence;
  label: string;
  loginUrl: string;
  homeUrl: string;
}

export const platforms = {
  boss: {
    authenticationEvidence: {
      cookieUrl: "https://www.zhipin.com/",
      kind: "cdp-cookie-names",
      requiredCookieNames: ["zp_at"],
    },
    homeUrl: "https://www.zhipin.com/",
    label: "BOSS直聘",
    loginUrl: "https://www.zhipin.com/web/user/",
  },
  yupao: {
    authenticationEvidence: {
      cookieDomain: "yupao.com",
      kind: "profile-cookie-names",
      requiredCookieNames: ["TOKEN", "USERID", "current_identity"],
    },
    homeUrl: "https://www.yupao.com/",
    label: "鱼泡直聘",
    loginUrl: "https://www.yupao.com/web/login/",
  },
} as const satisfies Record<string, PlatformDefinition>;

export type PlatformName = keyof typeof platforms;

export function isPlatformName(value: string): value is PlatformName {
  return Object.hasOwn(platforms, value);
}
