import type { Page } from "patchright";
import { expect, test } from "vitest";

import { ManagedPageTargets } from "#/browser/managed-page-targets.js";

const initialRecoveryRevision = 0;
const revisionAfterPageObservation = 1;

test("retains ownership across failed navigation and waits on a stable redirect", () => {
  let recoveryRevision = initialRecoveryRevision;
  let url = "about:blank";
  const page = { url: () => url } as Page;
  const pages = [page];
  const targetUrl = "https://www.zhipin.com/web/geek/recommend";
  const targets = new ManagedPageTargets<string>(
    (expectedUrl, currentUrl) => expectedUrl === currentUrl,
    () => recoveryRevision,
  );

  targets.claim(targetUrl, page);

  expect(targets.resolve(targetUrl, pages)).toEqual({ page, state: "navigate" });

  url = "https://www.zhipin.com/web/user/";
  targets.observe(targetUrl, page);

  expect(targets.resolve(targetUrl, pages)).toEqual({ page, state: "waiting" });

  url = "https://www.zhipin.com/web/geek/jobs";

  expect(targets.resolve(targetUrl, pages)).toEqual({ page, state: "waiting" });

  recoveryRevision = revisionAfterPageObservation;

  expect(targets.resolve(targetUrl, pages)).toEqual({ page, state: "navigate" });
});

test("assigns each page to only one target", () => {
  const firstTargetUrl = "https://www.zhipin.com/web/geek/recommend";
  let url = firstTargetUrl;
  const page = { url: () => url } as Page;
  const pages = [page];
  const targets = new ManagedPageTargets<string>(
    (expectedUrl, currentUrl) => expectedUrl === currentUrl,
  );
  targets.observe(firstTargetUrl, page);

  const secondTargetUrl = "https://www.zhipin.com/web/geek/jobs";
  url = secondTargetUrl;

  expect(targets.resolve(secondTargetUrl, pages)).toEqual({ page, state: "ready" });
  expect(targets.resolve(firstTargetUrl, pages)).toEqual({ state: "open" });
});

test("does not recover a ready target after its page is navigated elsewhere", () => {
  let recoveryRevision = initialRecoveryRevision;
  const targetUrl = "https://www.zhipin.com/web/geek/recommend";
  let url = targetUrl;
  const page = { url: () => url } as Page;
  const targets = new ManagedPageTargets<string>(
    (expectedUrl, currentUrl) => expectedUrl === currentUrl,
    () => recoveryRevision,
  );
  targets.observe(targetUrl, page);

  url = "https://www.zhipin.com/web/geek/jobs";
  recoveryRevision = revisionAfterPageObservation;

  expect(targets.resolve(targetUrl, [page])).toEqual({ page, state: "waiting" });
});
