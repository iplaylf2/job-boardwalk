import { expect, test } from "vitest";

import { derivePageAccessObservation } from "#/browser/platform-access-observer.js";

const observedAt = "2026-07-15T02:00:00.000Z";
const recruiterSurface = [
  "职位管理",
  "推荐牛人",
  "搜索牛人",
  "沟通",
  "公司管理",
  "账号权益",
  "升级VIP",
  "合成招聘账号",
] as const;

test("observes Yupao's authenticated recruiter controls", () => {
  expect(
    derivePageAccessObservation(
      {
        elements: [],
        text: recruiterSurface.join("\n"),
        url: "https://www.yupao.com/web/job-manage/",
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
