import type { PlatformId } from "@job-boardwalk/platform-catalog";

interface PlatformBrowserConfiguration {
  browseUrl: string;
  loginUrl: string;
  requiredCookieNames: readonly string[];
}

export const platformBrowserConfigurations = {
  boss: {
    browseUrl: "https://www.zhipin.com/",
    loginUrl: "https://www.zhipin.com/web/user/",
    requiredCookieNames: ["zp_at"],
  },
  yupao: {
    browseUrl: "https://www.yupao.com/",
    loginUrl: "https://www.yupao.com/web/login/",
    requiredCookieNames: ["TOKEN", "USERID", "current_identity"],
  },
} as const satisfies Record<PlatformId, PlatformBrowserConfiguration>;
