import { expect, test } from "vitest";

import { derivePageAccessObservation } from "#/browser/platform-access-observer.js";

const observedAt = "2026-08-02T00:00:00.000Z";
const profileHeader = [
  { href: "https://we.51job.com/pc/my/myjob", name: "合成求职者甲" },
  { href: "https://www.51job.com/resume/center", name: "在线简历" },
];
const applicationHeader = [
  { href: "https://login.51job.com/logout.php?lang=c", name: "退出帐号" },
  { href: "https://i.51job.com/userset/security_center.php?lang=c", name: "账号设置" },
  { href: "https://i.51job.com/resume/resume_center.php?lang=c", name: "简历中心" },
];

function observe(elements: { href?: string; name?: string }[], url = "https://www.51job.com/") {
  return derivePageAccessObservation({ elements, text: "合成页面", url }, () =>
    Date.parse(observedAt),
  );
}

test.each([profileHeader, applicationHeader])(
  "recognizes a complete 51job account header",
  (...elements) => {
    expect(observe(elements)).toEqual({
      authenticationState: "authenticated",
      evidence: "authenticated-page",
      observedAt,
      platformId: "51job",
      url: "https://www.51job.com/",
    });
  },
);

test("requires every account control in either header layout", () => {
  for (const header of [profileHeader, applicationHeader]) {
    for (const omitted of header) {
      expect(observe(header.filter((element) => element !== omitted))).toBeNull();
    }
  }
});

test.each(["", "登录/注册", "我的51Job"])("does not classify generic profile entry %s", (name) => {
  expect(
    observe(
      profileHeader.map((element) =>
        element.name === "合成求职者甲" ? { ...element, name } : element,
      ),
    ),
  ).toBeNull();
});

test.each([
  "http://we.51job.com/pc/my/myjob",
  "https://user:secret@we.51job.com/pc/my/myjob",
  "https://we.51job.com.evil.invalid/pc/my/myjob",
  "https://i.51job.com/pc/my/myjob",
])("requires the profile control's own HTTPS origin: %s", (href) => {
  expect(
    observe(
      profileHeader.map((element) =>
        element.name === "合成求职者甲" ? { ...element, href } : element,
      ),
    ),
  ).toBeNull();
});

test("keeps a bare personal-center URL and unnamed passive links unclassified", () => {
  expect(observe([], "https://we.51job.com/pc/my/myjob")).toBeNull();
  expect(observe(profileHeader.map(({ href }) => ({ href })))).toBeNull();
  expect(observe(profileHeader, "https://example.invalid/")).toBeNull();
});

test.each(["Please slide to verify", "please slide to complete the verification process."])(
  "recognizes the visible access challenge: %s",
  (instruction) => {
    const observation = derivePageAccessObservation({
      elements: profileHeader,
      text: `Access Verification\n${instruction}`,
      url: "https://jobs.51job.com/synthetic-city/900000001.html",
    });
    expect(observation).toMatchObject({
      evidence: "verification-page",
      interruption: "verification-required",
      platformId: "51job",
    });
    expect(observation).not.toHaveProperty("authenticationState");
  },
);

test.each([
  "合成工程师\nDevelop access verification and please slide to verify examples.",
  "Access Verification",
  "Please slide to verify",
  "Verification\n合成岗位正文",
])("does not classify incomplete or incidental verification text: %s", (text) => {
  expect(
    derivePageAccessObservation({ elements: [], text, url: "https://www.51job.com/" }),
  ).toBeNull();
});
