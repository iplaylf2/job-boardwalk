import type { Browser, BrowserContext } from "patchright";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { ManagedBrowser } from "#/browser/managed-browser.js";
import type { JobPostingWriter } from "#/workspace-service/job-posting-writer.js";
import type { JobEngagementWriter } from "#/workspace-service/job-engagement-writer.js";

const jobPostingWriter = {
  *write() {
    yield* [];
  },
} satisfies JobPostingWriter;
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
  const context = {
    browser: () => browser,
    close: () => Promise.resolve(),
    on: () => context,
    once: () => context,
    pages: () => [],
  } as unknown as BrowserContext;
  return context;
}

test("starts unavailable without leaking profile details through status", () => {
  const browser = new ManagedBrowser(
    "/private/profile",
    { jobEngagementWriter, jobPostingWriter },
    () => Promise.resolve(fakeContext()),
  );

  expect(browser.status).toEqual({ available: false });
});

test("contains browser launch failures as unavailable tool calls", async () => {
  const scope = createScope();
  const launchError = new Error(
    "graphical session unavailable at /private/browser-profile/Default",
  );
  const browser = new ManagedBrowser(
    "/private/profile",
    { jobEngagementWriter, jobPostingWriter },
    () => Promise.reject(launchError),
  );
  const reportedErrors: Error[] = [];
  const supervision = scope.run(() => browser.supervise((error) => reportedErrors.push(error)));

  await expect.poll(() => reportedErrors).toEqual([launchError]);
  expect(browser.status).toEqual({
    available: false,
    lastError: "浏览器启动或运行失败。",
  });
  expect(() => browser.executeTool("browser_tabs", { action: "list" }).next()).toThrow(
    /浏览器启动或运行失败/u,
  );
  expect(JSON.stringify(browser.status)).not.toMatch(/private|browser-profile|Default/u);

  await scope[Symbol.asyncDispose]();
  await expect(supervision).rejects.toThrow();
  expect(reportedErrors).toEqual([launchError]);
});
