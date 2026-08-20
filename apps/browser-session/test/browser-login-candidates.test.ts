import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { BrowserTabs } from "#/browser/browser-tabs.js";
import { derivePageAccessObservation } from "#/browser/platform-access-observer.js";
import { syntheticBrowserContext, syntheticLoginPage } from "./synthetic-login-handoff.js";

const noNavigations = 0;
const firstSnapshotCount = 1;
const syntheticYupaoAuthenticatedText = [
  "首页",
  "职位",
  "公司",
  "校园",
  "消息",
  "简历",
  "合成求职者",
].join("\n");

test("uses a later ready login page when the first login page has no usable controls", async () => {
  await using scope = createScope();
  const unusable = syntheticLoginPage("https://www.yupao.com/web/login/", {
    snapshotElements: [],
  });
  const ready = syntheticLoginPage("https://www.yupao.com/web/login/");
  const tabs = new BrowserTabs(syntheticBrowserContext(unusable.page, ready.page));

  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, derivePageAccessObservation),
  );

  expect(unusable.navigationCount).toBe(noNavigations);
  expect(ready.navigationCount).toBe(noNavigations);
  expect(result).toMatchObject({ id: 2, outcome: "handoff-ready" });
});

test("checks every pending login candidate during bounded readiness polling", async () => {
  await using scope = createScope();
  const unusable = syntheticLoginPage("https://www.yupao.com/web/login/", {
    snapshotElements: [],
  });
  let secondPageSnapshots = 0;
  const becomesReady = syntheticLoginPage("https://www.yupao.com/web/login/", {
    snapshotElements: () => {
      secondPageSnapshots += firstSnapshotCount;
      return secondPageSnapshots === firstSnapshotCount
        ? []
        : [{ name: "Synthetic login control", role: "button" }];
    },
  });
  const tabs = new BrowserTabs(syntheticBrowserContext(unusable.page, becomesReady.page));

  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, derivePageAccessObservation),
  );

  expect(result).toMatchObject({ id: 2, outcome: "handoff-ready" });
});

test("continues after a pending candidate leaves the login route during polling", async () => {
  await using scope = createScope();
  let redirectedSnapshots = 0;
  const redirected = syntheticLoginPage("https://www.yupao.com/web/login/", {
    afterSnapshot: (state) => {
      if (redirectedSnapshots !== firstSnapshotCount) {
        state.url = "https://www.yupao.com/web/verify/";
      }
    },
    snapshotElements: () => {
      redirectedSnapshots += firstSnapshotCount;
      return redirectedSnapshots === firstSnapshotCount
        ? []
        : [{ name: "Synthetic login control", role: "button" }];
    },
  });
  let readySnapshots = 0;
  const ready = syntheticLoginPage("https://www.yupao.com/web/login/", {
    snapshotElements: () => {
      readySnapshots += firstSnapshotCount;
      return readySnapshots === firstSnapshotCount
        ? []
        : [{ name: "Synthetic login control", role: "button" }];
    },
  });
  const tabs = new BrowserTabs(syntheticBrowserContext(redirected.page, ready.page));

  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, derivePageAccessObservation),
  );

  expect(redirected.url).toBe("https://www.yupao.com/web/verify/");
  expect(result).toMatchObject({ id: 2, outcome: "handoff-ready" });
});

test("prefers a later authenticated page over an earlier ready login page", async () => {
  await using scope = createScope();
  const ready = syntheticLoginPage("https://www.yupao.com/web/login/");
  const authenticated = syntheticLoginPage("https://www.yupao.com/a2/", {
    snapshotElements: [],
    snapshotText: syntheticYupaoAuthenticatedText,
  });
  const tabs = new BrowserTabs(syntheticBrowserContext(ready.page, authenticated.page));

  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, derivePageAccessObservation),
  );

  expect(result).toMatchObject({ id: 2, outcome: "already-authenticated" });
});

test("skips a ready login page that leaves the login route before selection", async () => {
  await using scope = createScope();
  const redirected = syntheticLoginPage("https://www.yupao.com/web/login/", {
    afterSnapshot: (state) => {
      state.url = "https://www.yupao.com/web/verify/";
    },
  });
  const ready = syntheticLoginPage("https://www.yupao.com/web/login/");
  const tabs = new BrowserTabs(syntheticBrowserContext(redirected.page, ready.page));

  const result = await scope.run(() =>
    tabs.prepareLogin({ platformId: "yupao" }, derivePageAccessObservation),
  );

  expect(redirected.url).toBe("https://www.yupao.com/web/verify/");
  expect(result).toMatchObject({ id: 2, outcome: "handoff-ready" });
});
