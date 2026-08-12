import { expect, test } from "vitest";

import { createPersistentContextLaunchOptions } from "#/browser/persistent-context-launch.js";

test("enables Chromium's process sandbox for default and selected executables", () => {
  expect(createPersistentContextLaunchOptions()).toEqual({
    chromiumSandbox: true,
    headless: false,
    viewport: null,
  });
  expect(createPersistentContextLaunchOptions("/synthetic/browser")).toEqual({
    chromiumSandbox: true,
    executablePath: "/synthetic/browser",
    headless: false,
    viewport: null,
  });
});
