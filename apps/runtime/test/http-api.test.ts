import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import type { PlatformBrowser } from "#/browser/playwright-platform-browser.js";
import { createHttpApi } from "#/http-api.js";
import { WorkspaceRepository } from "#/persistence/workspace-repository.js";

const badRequestStatus = 400;
const successfulStatus = 200;
const notFoundStatus = 404;

test("keeps request errors inside the long-lived runtime scope", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = new WorkspaceRepository(path.join(directory, "workspace.sqlite"));
  await using runtimeScope = createScope();
  const platformBrowser: PlatformBrowser = {
    close: () => Promise.resolve(),
    getAvailability: () => ({ available: true, executablePath: "/test/chromium" }),
    handoffToUser: () => Promise.resolve(),
    hasOpenSession: () => false,
  };
  const httpApi = createHttpApi(repository, runtimeScope, platformBrowser);

  try {
    const invalidResponse = await httpApi.request("/api/search-intent/locations", {
      body: "not-json",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(invalidResponse.status).toBe(badRequestStatus);

    const followingResponse = await httpApi.request("/api/workspace/overview");
    expect(followingResponse.status).toBe(successfulStatus);
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

test("opens a platform browser without adding account-action routes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = new WorkspaceRepository(path.join(directory, "workspace.sqlite"));
  await using runtimeScope = createScope();
  const handedOffPlatforms: string[] = [];
  const platformBrowser: PlatformBrowser = {
    close: () => Promise.resolve(),
    getAvailability: () => ({ available: true, executablePath: "/test/chromium" }),
    handoffToUser: (platformId) => {
      handedOffPlatforms.push(platformId);
      return Promise.resolve();
    },
    hasOpenSession: (platformId) => handedOffPlatforms.includes(platformId),
  };
  const httpApi = createHttpApi(repository, runtimeScope, platformBrowser);

  try {
    const response = await httpApi.request("/api/platforms/boss/browser-handoff", {
      method: "POST",
    });
    expect(response.status).toBe(successfulStatus);
    expect(await response.json()).toMatchObject({ platformId: "boss", status: "handed-off" });
    expect(handedOffPlatforms).toEqual(["boss"]);

    const unsupportedAction = await httpApi.request("/api/platforms/boss/apply", {
      method: "POST",
    });
    expect(unsupportedAction.status).toBe(notFoundStatus);
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});
