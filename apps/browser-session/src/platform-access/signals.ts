import type { PlatformId } from "@job-boardwalk/platform-catalog";

interface PlatformAccessSignals {
  authenticationCookieNames: readonly string[];
  hosts: readonly string[];
  loginPathPrefixes: readonly string[];
}

export const platformAccessSignals = {
  boss: {
    authenticationCookieNames: ["zp_at"],
    hosts: ["www.zhipin.com"],
    loginPathPrefixes: ["/web/user/"],
  },
  yupao: {
    authenticationCookieNames: ["TOKEN", "USERID", "current_identity"],
    hosts: ["www.yupao.com"],
    loginPathPrefixes: ["/web/login/"],
  },
} as const satisfies Record<PlatformId, PlatformAccessSignals>;
