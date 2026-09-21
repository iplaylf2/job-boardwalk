import { EventEmitter } from "node:events";
import type { Browser, BrowserContext } from "patchright";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { ManagedBrowser } from "#/browser/managed-browser.js";
import type { JobObservationWriter } from "#/workspace-service/job-observation-writer.js";
import type { JobEngagementWriter } from "#/workspace-service/job-engagement-writer.js";

const jobObservationWriter = {
  *writeCardObservation() {
    yield* [];
    return { outcome: "unchanged" };
  },
  *writeDescriptionObservation() {
    yield* [];
    return { outcome: "unchanged" };
  },
} satisfies JobObservationWriter;
const jobEngagementWriter = {
  *write(snapshot) {
    yield* [];
    return {
      complete: snapshot.complete,
      engagement: snapshot.engagement,
      observed: snapshot.jobs.length,
      platformId: snapshot.platformId,
      removed: 0,
      synchronizedAt: snapshot.capturedAt,
    };
  },
} satisfies JobEngagementWriter;
function fakeContext(): BrowserContext {
  const browser = { version: () => "150.0.0.0" } as Browser;
  // eslint-disable-next-line unicorn/prefer-event-target -- BrowserContext exposes Node event semantics.
  const events = new EventEmitter();
  const context = Object.assign(events, {
    browser: () => browser,
    close: () => {
      events.emit("close");
      return Promise.resolve();
    },
    pages: () => [],
  }) as unknown as BrowserContext;
  return context;
}

test("reports startup before the browser is ready", () => {
  const browser = new ManagedBrowser(
    "/private/profile",
    { jobEngagementWriter, jobObservationWriter },
    () => Promise.resolve(fakeContext()),
  );

  expect(browser.status).toMatchObject({ available: false, lifecycle: { phase: "starting" } });
});

test("contains browser launch failures as unavailable tool calls", async () => {
  const scope = createScope();
  const launchError = new Error(
    "graphical session unavailable at /private/browser-profile/Default",
  );
  const browser = new ManagedBrowser(
    "/private/profile",
    { jobEngagementWriter, jobObservationWriter },
    () => Promise.reject(launchError),
  );
  const reportedErrors: Error[] = [];
  const supervision = scope.run(() => browser.supervise((error) => reportedErrors.push(error)));

  await expect.poll(() => reportedErrors).toEqual([launchError]);
  expect(browser.status).toMatchObject({
    available: false,
    lifecycle: {
      lastFailure: {
        category: "launch-failed",
        occurredAt: expect.any(String),
      },
      nextAttemptAt: expect.any(String),
      phase: "retry-wait",
    },
  });
  expect(() => browser.executeTool("browser_tabs", { action: "list" }).next()).toThrow(
    /浏览器启动或运行失败/u,
  );
  expect(JSON.stringify(browser.status)).not.toMatch(/private|browser-profile|Default/u);

  await scope[Symbol.asyncDispose]();
  await expect(supervision).rejects.toThrow();
  expect(reportedErrors).toEqual([launchError]);
});

test("reports closure, waits, relaunches, and stops without treating shutdown as failure", async () => {
  // eslint-disable-next-line unicorn/prefer-event-target -- BrowserContext exposes Node event semantics.
  const events = new EventEmitter();
  const firstLaunch = 1;
  const recoveredLaunch = 2;
  const first = Object.assign(events, {
    browser: () => ({ version: () => "synthetic-browser" }),
    close: () => {
      events.emit("close");
      return Promise.resolve();
    },
    pages: () => [],
  }) as unknown as BrowserContext;
  let launches = 0;
  const browser = new ManagedBrowser(
    "/private/profile",
    { jobEngagementWriter, jobObservationWriter },
    () => {
      launches += firstLaunch;
      return Promise.resolve(launches === firstLaunch ? first : fakeContext());
    },
  );
  const errors: Error[] = [];
  const scope = createScope();
  const supervision = scope.run(() => browser.supervise((error) => errors.push(error)));
  await expect.poll(() => browser.status.available).toBe(true);
  events.emit("close");
  expect(browser.status.available).toBe(false);
  await expect
    .poll(() => browser.status)
    .toMatchObject({
      available: false,
      lifecycle: {
        lastFailure: { category: "window-closed" },
        phase: "retry-wait",
      },
    });
  await expect.poll(() => launches, { timeout: 3000 }).toBe(recoveredLaunch);
  await expect.poll(() => browser.status.available).toBe(true);
  expect(errors).toHaveLength(firstLaunch);
  await scope[Symbol.asyncDispose]();
  await expect(supervision).rejects.toThrow();
  expect(browser.status).toMatchObject({ available: false, lifecycle: { phase: "stopped" } });
  expect(launches).toBe(recoveredLaunch);
  expect(errors).toHaveLength(firstLaunch);
});
