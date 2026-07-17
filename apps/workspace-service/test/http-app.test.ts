import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// oxlint-disable max-lines -- This suite keeps the complete public HTTP boundary visible together.
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
const maximumPageSizePlusOne = 49;
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

// oxlint-disable-next-line max-lines-per-function -- Representative validation failures share one lifecycle assertion.
test("keeps request errors inside the long-lived service scope", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const httpApp = createTestHttpApp(repository, serviceScope);

  try {
    const invalidResponse = await httpApp.request("/api/search-intents", {
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

    const invalidIntentSourceResponse = await httpApp.request("/api/search-intents", {
      body: JSON.stringify({
        city: "北京",
        initiatedBy: "user",
        name: "北京 Node.js",
        position: "Node.js",
        reason: "test",
        recommendationPages: [
          {
            label: "错误来源",
            platformId: "yupao",
            url: "https://example.invalid/topic/a2c1488/",
          },
        ],
        selected: true,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(invalidIntentSourceResponse.status).toBe(badRequestStatus);

    const credentialedIntentSourceResponse = await httpApp.request("/api/search-intents", {
      body: JSON.stringify({
        city: "北京",
        initiatedBy: "user",
        name: "带凭据来源",
        position: "Node.js",
        reason: "test",
        recommendationPages: [
          {
            label: "错误来源",
            platformId: "yupao",
            url: "https://user:secret@www.yupao.com/topic/a2c1488/",
          },
        ],
        selected: true,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(credentialedIntentSourceResponse.status).toBe(badRequestStatus);

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
test("updates profile and selected job-search intent through the public HTTP boundary", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const httpApp = createTestHttpApp(repository, serviceScope);

  try {
    const initialProfileResponse = await postProfileFact(httpApp, "后端工程师");
    expect(initialProfileResponse.status).toBe(createdStatus);
    const updatedProfileResponse = await postProfileFact(httpApp, "平台工程师");
    expect(updatedProfileResponse.status).toBe(createdStatus);
    const intentResponse = await httpApp.request("/api/search-intents", {
      body: JSON.stringify({
        city: "上海",
        initiatedBy: "user",
        name: "上海平台工程",
        position: "平台工程师",
        reason: "test",
        recommendationPages: [
          {
            label: "上海后端开发",
            platformId: "yupao",
            url: "https://www.yupao.com/topic/a1c1488/",
          },
        ],
        selected: true,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(intentResponse.status).toBe(createdStatus);
    const overviewResponse = await httpApp.request("/api/workspace/overview");
    const overview = (await overviewResponse.json()) as {
      jobSearchIntents: { id: number }[];
      profileFacts: { id: number }[];
    };
    expect(overview).toMatchObject({
      jobSearchIntents: [
        {
          city: "上海",
          name: "上海平台工程",
          position: "平台工程师",
          recommendationPages: [
            {
              label: "上海后端开发",
              platformId: "yupao",
              url: "https://www.yupao.com/topic/a1c1488/",
            },
          ],
          selected: true,
        },
      ],
      profileFacts: [
        {
          confirmed: true,
          key: "target-role",
          source: "conversation",
          value: "平台工程师",
        },
      ],
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
    const deleteIntentResponse = await httpApp.request(
      `/api/search-intents/${overview.jobSearchIntents[firstCollectionIndex]?.id}`,
      {
        body: JSON.stringify({
          initiatedBy: "user",
          reason: "test",
        }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      },
    );
    expect(deleteIntentResponse.status).toBe(successfulStatus);
    const emptyOverviewResponse = await httpApp.request("/api/workspace/overview");
    expect(await emptyOverviewResponse.json()).toMatchObject({
      jobSearchIntents: [],
      profileFacts: [],
    });
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

// oxlint-disable-next-line max-lines-per-function -- One flow covers accepted, rejected, and read behavior.
test("stores and reads collected page facts through the public HTTP boundary", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const httpApp = createTestHttpApp(repository, serviceScope);

  try {
    const response = await httpApp.request("/api/jobs", {
      body: JSON.stringify({
        collectedAt: "2026-07-17T10:00:00.000Z",
        company: "星海科技",
        details: ["Node.js"],
        discoveryUrl: "https://www.zhipin.com/web/geek/jobs",
        initiatedBy: "system",
        jobUrl: "https://www.zhipin.com/job_detail/example.html",
        location: "北京",
        platformId: "boss",
        reason: "test",
        salaryText: "20-30K",
        summary: "负责后端服务开发。",
        title: "后端开发",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(createdStatus);
    expect(await response.json()).toMatchObject({
      job: {
        company: "星海科技",
        sources: [{ platformId: "boss" }],
        title: "后端开发",
      },
      outcome: "created",
    });

    const invalidSourceResponse = await httpApp.request("/api/jobs", {
      body: JSON.stringify({
        collectedAt: "2026-07-17T10:00:00.000Z",
        company: "星海科技",
        details: [],
        discoveryUrl: "https://example.invalid/jobs",
        initiatedBy: "system",
        jobUrl: "https://example.invalid/job/example",
        platformId: "boss",
        reason: "test",
        summary: "负责后端服务开发。",
        title: "后端开发",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(invalidSourceResponse.status).toBe(badRequestStatus);

    const libraryResponse = await httpApp.request("/api/jobs?page=1&pageSize=1&platform=boss");
    expect(await libraryResponse.json()).toMatchObject({
      jobs: [{ company: "星海科技", sources: [{ platformId: "boss" }] }],
      page: 1,
      pageCount: 1,
      pageSize: 1,
      total: 1,
    });
    const invalidPageSize = await httpApp.request(
      `/api/jobs?pageSize=${String(maximumPageSizePlusOne)}`,
    );
    expect(invalidPageSize.status).toBe(badRequestStatus);
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

    const libraryResponse = await httpApp.request("/mcp", {
      body: JSON.stringify({
        id: 2,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: {}, name: "read_job_library" },
      }),
      headers: mcpRequestHeaders,
      method: "POST",
    });
    expect(await libraryResponse.json()).toMatchObject({
      result: { structuredContent: { jobs: [] } },
    });
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});
