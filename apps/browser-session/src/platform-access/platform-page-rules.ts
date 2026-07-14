import type { PlatformId } from "@job-boardwalk/platform-catalog";

export interface PlatformPageRules {
  accountIdentitySelectors: readonly string[];
  hostnames: readonly string[];
  loginPathPrefixes: readonly string[];
  loginSelectors: readonly string[];
}

export const platformPageRules = {
  boss: {
    accountIdentitySelectors: [
      "[class*='user-nav']",
      "[class*='avatar']",
      "a[href*='/web/geek/recommend']",
    ],
    hostnames: ["www.zhipin.com"],
    loginPathPrefixes: ["/web/user/"],
    loginSelectors: ["input[type='tel']", "input[name*='phone']", "[class*='login']"],
  },
  yupao: {
    accountIdentitySelectors: ["[class*='avatar']", "[class*='user-info']"],
    hostnames: ["www.yupao.com"],
    loginPathPrefixes: ["/web/login/"],
    loginSelectors: ["input[type='tel']", "input[name*='phone']", "[class*='login']"],
  },
} as const satisfies Record<PlatformId, PlatformPageRules>;
