import type { Browser, BrowserContext } from "patchright";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { ManagedBrowser } from "#/browser/managed-browser.js";

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
  const browser = new ManagedBrowser("/private/profile", () => Promise.resolve(fakeContext()));

  expect(browser.status).toEqual({ available: false });
});

test("contains browser launch failures as unavailable tool calls", async () => {
  const scope = createScope();
  const launchError = new Error("graphical session unavailable");
  const browser = new ManagedBrowser("/private/profile", () => Promise.reject(launchError));
  const reportedErrors: Error[] = [];
  const supervision = scope.run(() => browser.supervise((error) => reportedErrors.push(error)));

  await expect.poll(() => reportedErrors).toEqual([launchError]);
  expect(browser.status).toEqual({
    available: false,
    lastError: "graphical session unavailable",
  });
  expect(() => browser.executeTool("browser_tabs", { action: "list" }).next()).toThrow(
    /graphical session unavailable/u,
  );

  await scope[Symbol.asyncDispose]();
  await expect(supervision).rejects.toThrow();
});
