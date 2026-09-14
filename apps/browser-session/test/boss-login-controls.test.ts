import { createScope } from "@shajara/host";
import { expect, test } from "vitest";
import { BrowserTabs } from "#/browser/browser-tabs.js";
import { derivePageAccessObservation as observePageAccess } from "#/browser/platform-access-observer.js";
import { syntheticLoginPage, syntheticBrowserContext } from "./synthetic-login-handoff.js";

const noNavigations = 0;

test("hands off an enabled BOSS login-mode link", async () => {
  await using scope = createScope();
  const login = syntheticLoginPage("https://www.zhipin.com/web/user/", {
    snapshotElements: [{ name: "验证码登录/注册", role: "link" }],
    snapshotText: "微信扫码 安全登录",
  });
  const tabs = new BrowserTabs(syntheticBrowserContext(login.page));
  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: "boss" }, observePageAccess),
  );
  expect(result).toMatchObject({ id: 1, outcome: "handoff-ready" });
  expect(login.navigationCount).toBe(noNavigations);
});

test.each([
  [],
  [{ href: "https://www.zhipin.com/privacy", name: "隐私协议", role: "link" }],
  [{ disabled: true, name: "验证码登录/注册", role: "link" }],
])("skips a BOSS login page without an enabled login control", async (...snapshotElements) => {
  await using scope = createScope();
  const login = syntheticLoginPage("https://www.zhipin.com/web/user/", {
    snapshotElements,
    snapshotText: "微信扫码 安全登录",
  });
  const ready = syntheticLoginPage("https://www.zhipin.com/web/user/");
  const tabs = new BrowserTabs(syntheticBrowserContext(login.page, ready.page));
  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: "boss" }, observePageAccess),
  );
  expect(result).toMatchObject({ id: 2, outcome: "handoff-ready" });
});
