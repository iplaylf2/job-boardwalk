import { platforms } from "#/platforms.js";
import { describe, expect, test } from "vitest";

describe("platform authentication evidence", () => {
  test("BOSS observes its authenticated CDP cookie", () => {
    expect(platforms.boss.authenticationEvidence).toEqual({
      cookieUrl: "https://www.zhipin.com/",
      kind: "cdp-cookie-names",
      requiredCookieNames: ["zp_at"],
    });
  });

  test("Yupao requires the observed identity cookie combination", () => {
    expect(platforms.yupao.authenticationEvidence).toEqual({
      cookieDomain: "yupao.com",
      kind: "profile-cookie-names",
      requiredCookieNames: ["TOKEN", "USERID", "current_identity"],
    });
  });
});
