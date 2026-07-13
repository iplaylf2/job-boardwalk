import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import type { PlatformBrowser } from "#/browser/playwright-platform-browser.js";
import { createRuntimeHttpApp } from "#/http/app.js";
import { WorkspaceRepository } from "#/persistence/workspace-repository.js";

const badRequestStatus = 400;
const successfulStatus = 200;
const notFoundStatus = 404;
const mcpRequestHeaders = {
  accept: "application/json, text/event-stream",
  "content-type": "application/json",
};

test("keeps request errors inside the long-lived runtime scope", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = new WorkspaceRepository(path.join(directory, "workspace.sqlite"));
  await using runtimeScope = createScope();
  const platformBrowser: PlatformBrowser = {
    *close() {
      yield* [];
    },
    getAvailability: () => ({ available: true, executablePath: "/test/chromium" }),
    hasOpenSession: () => false,
    *open() {
      yield* [];
      throw new Error("browser unavailable");
    },
  };
  const httpApp = createRuntimeHttpApp(repository, runtimeScope, platformBrowser);

  try {
    const invalidResponse = await httpApp.request("/api/search-intent/locations", {
      body: "not-json",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(invalidResponse.status).toBe(badRequestStatus);

    const failedOpenResponse = await httpApp.request("/api/platforms/boss/browser/open", {
      method: "POST",
    });
    expect(failedOpenResponse.status).toBe(badRequestStatus);

    const followingResponse = await httpApp.request("/api/workspace/overview");
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
  const openedPlatforms: string[] = [];
  const platformBrowser: PlatformBrowser = {
    *close() {
      yield* [];
    },
    getAvailability: () => ({ available: true, executablePath: "/test/chromium" }),
    hasOpenSession: (platformId) => openedPlatforms.includes(platformId),
    *open(platformId) {
      openedPlatforms.push(platformId);
      yield* [];
    },
  };
  const httpApp = createRuntimeHttpApp(repository, runtimeScope, platformBrowser);

  try {
    const response = await httpApp.request("/api/platforms/boss/browser/open", {
      method: "POST",
    });
    expect(response.status).toBe(successfulStatus);
    expect(await response.json()).toMatchObject({ platformId: "boss", status: "opened" });
    expect(openedPlatforms).toEqual(["boss"]);

    const unsupportedAction = await httpApp.request("/api/platforms/boss/apply", {
      method: "POST",
    });
    expect(unsupportedAction.status).toBe(notFoundStatus);
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

test("serves MCP from the same runtime state", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = new WorkspaceRepository(path.join(directory, "workspace.sqlite"));
  await using runtimeScope = createScope();
  const platformBrowser: PlatformBrowser = {
    *close() {
      yield* [];
    },
    getAvailability: () => ({ available: true, executablePath: "/test/chromium" }),
    hasOpenSession: () => false,
    *open() {
      yield* [];
    },
  };
  const httpApp = createRuntimeHttpApp(repository, runtimeScope, platformBrowser);
  repository.setProfileFact({
    confirmed: true,
    key: "target-role",
    reason: "test",
    source: "test",
    value: "后端工程师",
  });

  try {
    const response = await httpApp.request("/mcp", {
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: {}, name: "read_workspace_overview" },
      }),
      headers: mcpRequestHeaders,
      method: "POST",
    });
    expect(response.status).toBe(successfulStatus);
    expect(await response.json()).toMatchObject({
      result: { structuredContent: { profileFacts: [{ value: "后端工程师" }] } },
    });
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});
