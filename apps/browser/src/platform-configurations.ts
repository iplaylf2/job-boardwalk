import type { AuthenticationEvidence } from "./login/evidence.js";
import { platformCatalog } from "@job-boardwalk/platforms";
import type { PlatformName } from "@job-boardwalk/platforms";

interface PlatformConfiguration {
  authenticationEvidence: AuthenticationEvidence;
  label: string;
  loginUrl: string;
  homeUrl: string;
}

export const platformConfigurations = {
  boss: {
    authenticationEvidence: {
      cookieUrl: "https://www.zhipin.com/",
      kind: "cdp-cookie-names",
      requiredCookieNames: ["zp_at"],
    },
    homeUrl: "https://www.zhipin.com/",
    label: platformCatalog.boss.label,
    loginUrl: "https://www.zhipin.com/web/user/",
  },
  yupao: {
    authenticationEvidence: {
      cookieDomain: "yupao.com",
      kind: "profile-cookie-names",
      requiredCookieNames: ["TOKEN", "USERID", "current_identity"],
    },
    homeUrl: "https://www.yupao.com/",
    label: platformCatalog.yupao.label,
    loginUrl: "https://www.yupao.com/web/login/",
  },
} as const satisfies Record<PlatformName, PlatformConfiguration>;

export function isPlatformName(value: string): value is PlatformName {
  return Object.hasOwn(platformConfigurations, value);
}
