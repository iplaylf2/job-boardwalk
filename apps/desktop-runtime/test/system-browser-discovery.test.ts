import path from "node:path";

import { describe, expect, test } from "vitest";

import { discoverSystemBrowser, systemBrowserCandidates } from "#/system-browser-discovery.js";

describe("systemBrowserCandidates", () => {
  test("uses an explicit source-development browser override as the only candidate", () => {
    const executablePath = path.resolve("synthetic-browser", "microsoft-edge");

    expect(
      systemBrowserCandidates("linux", {
        JOB_BOARDWALK_BROWSER_EXECUTABLE_PATH: executablePath,
      }),
    ).toEqual([{ executablePath, family: "Edge" }]);
  });
});

describe("discoverSystemBrowser", () => {
  const chrome = {
    executablePath: process.execPath,
    family: "Chrome" as const,
  };

  test("classifies a recognizable Chrome version as recognized", async () => {
    await expect(
      discoverSystemBrowser([chrome], () => Promise.resolve("Google Chrome 141.0.7390.0")),
    ).resolves.toMatchObject({
      executablePath: chrome.executablePath,
      family: "Chrome",
      state: "recognized",
      version: "141.0.7390.0",
    });
  });

  test("does not invent a compatibility floor for an older recognizable version", async () => {
    await expect(
      discoverSystemBrowser([chrome], () => Promise.resolve("Google Chrome 119.0.0.0")),
    ).resolves.toMatchObject({
      executablePath: chrome.executablePath,
      family: "Chrome",
      state: "recognized",
      version: "119.0.0.0",
    });
  });

  test("classifies output without a recognizable version as uninspectable", async () => {
    await expect(
      discoverSystemBrowser([chrome], () => Promise.resolve("Synthetic browser")),
    ).resolves.toMatchObject({
      executablePath: chrome.executablePath,
      family: "Chrome",
      state: "uninspectable",
      version: "Synthetic browser",
    });
  });

  test("distinguishes an inspection failure from a missing installation", async () => {
    await expect(
      discoverSystemBrowser([chrome], () =>
        Promise.reject(new Error("synthetic inspection failure")),
      ),
    ).resolves.toMatchObject({
      executablePath: chrome.executablePath,
      family: "Chrome",
      state: "uninspectable",
      version: "unknown",
    });
  });
});
