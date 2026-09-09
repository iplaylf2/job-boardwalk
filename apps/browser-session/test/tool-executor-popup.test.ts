import { setImmediate } from "node:timers";
import { EventEmitter } from "node:events";

// oxlint-disable unicorn/prefer-event-target -- Patchright exposes Node-style on/off event APIs.
import type { BrowserContext, Locator, Page } from "patchright";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { BackgroundCollectionControl } from "#/browser/background-collection-control.js";
import { BrowserTabs } from "#/browser/browser-tabs.js";
import { BrowserToolExecutor } from "#/browser/tool-executor.js";
import { createSyntheticPageLocator } from "./synthetic-page-locator.js";

const sourceUrl = "https://www.zhipin.com/beijing/";
const popupUrl = "https://www.zhipin.com/job_detail/example.html";

function fakePage(input: {
  elements?: object[];
  events?: EventEmitter;
  locator: Locator;
  url: string;
}) {
  const events = input.events ?? new EventEmitter();
  function snapshot() {
    return Promise.resolve({
      documentReadyState: "complete",
      elements: input.elements ?? [],
      text: "职位详情",
      title: "BOSS直聘",
      truncated: false,
      url: input.url,
      viewport: { height: 900, scrollY: 0, width: 1200 },
    });
  }
  return Object.assign(events, {
    bringToFront: () => Promise.resolve(),
    evaluate: snapshot,
    isClosed: () => false,
    locator: createSyntheticPageLocator({
      nth: () => input.locator,
      readSnapshot: snapshot,
      title: "BOSS直聘",
    }),
    title: () => Promise.resolve("BOSS直聘"),
    url: () => input.url,
  }) as unknown as Page;
}

function fakeContextWithPopup(deferred = false): BrowserContext {
  const contextEvents = new EventEmitter();
  const sourceEvents = new EventEmitter();
  const popupPage = fakePage({ locator: {} as Locator, url: popupUrl });
  const signature = `link:查看职位:${popupUrl}`;
  const locator = {
    click: () => {
      function openPopup() {
        contextEvents.emit("page", popupPage);
        sourceEvents.emit("popup", popupPage);
      }
      if (deferred) {
        setImmediate(openPopup);
      } else {
        openPopup();
      }
      return Promise.resolve();
    },
    evaluate: () => Promise.resolve(signature),
    scrollIntoViewIfNeeded: () => Promise.resolve(),
  } as unknown as Locator;
  const sourcePage = fakePage({
    elements: [
      {
        disabled: false,
        href: popupUrl,
        name: "查看职位",
        role: "link",
        signature,
        sourceIndex: 0,
      },
    ],
    events: sourceEvents,
    locator,
    url: sourceUrl,
  });
  return Object.assign(contextEvents, { pages: () => [sourcePage] }) as unknown as BrowserContext;
}

test.each([false, true])(
  "returns and selects a popup, including after click completion: %s",
  async (deferred) => {
    const executor = new BrowserToolExecutor(
      new BrowserTabs(fakeContextWithPopup(deferred)),
      () => null,
      new BackgroundCollectionControl(),
      {
        recordReturnedControl: () => null,
        synchronizeJobEngagement: () => expect.unreachable("此测试不应同步岗位跟进"),
        writeJobDescriptionObservation: () => expect.unreachable("此测试不应写入岗位详情"),
      },
    );
    await using scope = createScope();

    await scope.run(() => executor.execute("browser_snapshot", {}));
    const result = await scope.run(() => executor.execute("browser_click", { ref: "e1" }));
    const snapshot = await scope.run(() => executor.execute("browser_snapshot", {}));

    expect(result).toMatchObject({ url: popupUrl });
    expect(snapshot).toMatchObject({ url: popupUrl });
  },
);

test("never reassigns an expired reference to a later snapshot", async () => {
  const executor = new BrowserToolExecutor(
    new BrowserTabs(fakeContextWithPopup()),
    () => null,
    new BackgroundCollectionControl(),
    {
      recordReturnedControl: () => null,
      synchronizeJobEngagement: () => expect.unreachable("此测试不应同步岗位跟进"),
      writeJobDescriptionObservation: () => expect.unreachable("此测试不应写入岗位详情"),
    },
  );
  await using scope = createScope();
  await scope.run(() => executor.execute("browser_snapshot", {}));
  const latest = await scope.run(() => executor.execute("browser_snapshot", {}));
  expect(latest).toMatchObject({ elements: [{ ref: "e2" }] });
  const rejected = await scope.run(function* rejectExpiredReference() {
    try {
      yield* executor.execute("browser_click", { ref: "e1" });
      return false;
    } catch {
      return true;
    }
  });
  expect(rejected).toBe(true);
  const result = await scope.run(() => executor.execute("browser_click", { ref: "e2" }));
  expect(result).toMatchObject({ url: popupUrl });
});
