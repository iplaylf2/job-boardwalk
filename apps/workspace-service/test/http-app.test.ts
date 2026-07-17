import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { createWorkspaceServiceHttpApp } from "#/http/app.js";
import { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import { BrowserSessionPresenceTracker } from "#/runtime/browser-session-presence.js";

const badRequestStatus = 400;
const createdStatus = 201;
const successfulStatus = 200;
const forbiddenStatus = 403;
const internalServerErrorStatus = 500;
const firstCollectionIndex = 0;
const migrationsDirectory = path.resolve(import.meta.dirname, "../migrations");
const mcpRequestHeaders = {
  accept: "application/json, text/event-stream",
  "content-type": "application/json",
};
function createTestHttpApp(
  repository: WorkspaceRepository,
  serviceScope: ReturnType<typeof createScope>,
  presenceTracker: BrowserSessionPresenceTracker = new BrowserSessionPresenceTracker(),
) {
  return createWorkspaceServiceHttpApp({
    browserSessionPresenceTracker: presenceTracker,
    repository,
    serviceScope,
  });
}

function createTestRepository(directory: string): WorkspaceRepository {
  return new WorkspaceRepository({
    databasePath: path.join(directory, "workspace.sqlite"),
    migrationsDirectory,
  });
}

function postProfileFact(httpApp: ReturnType<typeof createWorkspaceServiceHttpApp>, value: string) {
  return httpApp.request("/api/profile/facts", {
    body: JSON.stringify({
      confirmed: true,
      initiatedBy: "agent",
      key: "target-role",
      reason: "test",
      source: "conversation",
      value,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

test("keeps request errors inside the long-lived service scope", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const httpApp = createTestHttpApp(repository, serviceScope);

  try {
    const invalidResponse = await httpApp.request("/api/search-intent/locations", {
      body: "not-json",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(invalidResponse.status).toBe(badRequestStatus);

    const invalidBooleanResponse = await httpApp.request("/api/profile/facts", {
      body: JSON.stringify({
        confirmed: "yes",
        initiatedBy: "agent",
        key: "target-role",
        reason: "test",
        source: "test",
        value: "后端工程师",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(invalidBooleanResponse.status).toBe(badRequestStatus);

    const followingResponse = await httpApp.request("/api/workspace/overview");
    expect(followingResponse.status).toBe(successfulStatus);
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

test("reports an unexpected repository failure as a server error", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const httpApp = createTestHttpApp(repository, serviceScope);
  repository.close();

  try {
    const response = await httpApp.request("/api/workspace/overview");
    expect(response.status).toBe(internalServerErrorStatus);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test.each([
  { expectedStatus: createdStatus, name: "accepts localhost", origin: "http://localhost:54311" },
  { expectedStatus: badRequestStatus, name: "rejects a malformed origin", origin: "not a URL" },
  {
    expectedStatus: forbiddenStatus,
    name: "rejects an external origin",
    origin: "https://example.invalid",
  },
])("$name at the Workspace Service trust boundary", async ({ expectedStatus, origin }) => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const httpApp = createTestHttpApp(repository, serviceScope);

  try {
    const response = await httpApp.request("/api/profile/facts", {
      body: JSON.stringify({
        confirmed: true,
        initiatedBy: "agent",
        key: "target-role",
        reason: "test",
        source: "test",
        value: "后端工程师",
      }),
      headers: { "content-type": "application/json", origin },
      method: "POST",
    });
    expect(response.status).toBe(expectedStatus);
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

// oxlint-disable-next-line max-lines-per-function, max-statements -- One flow verifies the complete CRUD boundary.
test("updates profile and target intent through the public HTTP boundary", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const httpApp = createTestHttpApp(repository, serviceScope);

  try {
    const initialProfileResponse = await postProfileFact(httpApp, "后端工程师");
    expect(initialProfileResponse.status).toBe(createdStatus);
    const updatedProfileResponse = await postProfileFact(httpApp, "平台工程师");
    expect(updatedProfileResponse.status).toBe(createdStatus);
    const locationResponse = await httpApp.request("/api/search-intent/locations", {
      body: JSON.stringify({
        city: "上海",
        initiatedBy: "user",
        priority: 1,
        reason: "test",
        requirement: "preferred",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(locationResponse.status).toBe(createdStatus);

    const overviewResponse = await httpApp.request("/api/workspace/overview");
    const overview = (await overviewResponse.json()) as {
      profileFacts: { id: number }[];
      targetLocations: { id: number }[];
    };
    expect(overview).toMatchObject({
      profileFacts: [
        {
          confirmed: true,
          key: "target-role",
          source: "conversation",
          value: "平台工程师",
        },
      ],
      targetLocations: [{ city: "上海", priority: 1, requirement: "preferred" }],
    });

    const deleteProfileResponse = await httpApp.request(
      `/api/profile/facts/${overview.profileFacts[firstCollectionIndex]?.id}`,
      {
        body: JSON.stringify({
          initiatedBy: "user",
          reason: "test",
        }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      },
    );
    expect(deleteProfileResponse.status).toBe(successfulStatus);
    const deleteLocationResponse = await httpApp.request(
      `/api/search-intent/locations/${overview.targetLocations[firstCollectionIndex]?.id}`,
      {
        body: JSON.stringify({
          initiatedBy: "user",
          reason: "test",
        }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      },
    );
    expect(deleteLocationResponse.status).toBe(successfulStatus);
    const emptyOverviewResponse = await httpApp.request("/api/workspace/overview");
    expect(await emptyOverviewResponse.json()).toMatchObject({
      profileFacts: [],
      targetLocations: [],
    });
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

test("accepts leased Browser Session presence for dashboard reads", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const presenceTracker = new BrowserSessionPresenceTracker(() =>
    Date.parse("2026-07-15T01:00:00.000Z"),
  );
  const httpApp = createTestHttpApp(repository, serviceScope, presenceTracker);

  try {
    const reportResponse = await httpApp.request("/api/browser-session/status", {
      body: JSON.stringify({
        browserStatus: { available: true, browserVersion: "149.0", tabCount: 1 },
        platformAccessObservations: [],
      }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    expect(reportResponse.status).toBe(successfulStatus);
    expect(await reportResponse.json()).toMatchObject({
      browserStatus: { available: true, tabCount: 1 },
      state: "online",
    });

    const overviewResponse = await httpApp.request("/api/workspace/overview");
    expect(await overviewResponse.json()).toMatchObject({
      browserSessionPresence: {
        browserStatus: { available: true, browserVersion: "149.0", tabCount: 1 },
        receivedAt: "2026-07-15T01:00:00.000Z",
        state: "online",
      },
    });

    const invalidResponse = await httpApp.request("/api/browser-session/status", {
      body: JSON.stringify({
        browserStatus: { available: true },
        platformAccessObservations: [],
      }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    expect(invalidResponse.status).toBe(badRequestStatus);
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

test("serves MCP from the same workspace state", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const httpApp = createTestHttpApp(repository, serviceScope);
  repository.setProfileFact({
    confirmed: true,
    initiatedBy: "agent",
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
