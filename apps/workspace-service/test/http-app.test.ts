import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// oxlint-disable max-lines -- This suite keeps the complete public HTTP boundary visible together.
import {
  JobPostingPage,
  ResearchReport,
  ResearchReportList,
  WorkspaceOverview,
} from "@job-boardwalk/contracts";
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

function mcpRequest(
  httpApp: ReturnType<typeof createWorkspaceServiceHttpApp>,
  input: { id: number; method: string; params?: object },
) {
  return httpApp.request("/mcp", {
    body: JSON.stringify({
      id: input.id,
      jsonrpc: "2.0",
      method: input.method,
      ...(input.params ? { params: input.params } : {}),
    }),
    headers: mcpRequestHeaders,
    method: "POST",
  });
}

function seedMcpWorkspace(repository: WorkspaceRepository): void {
  repository.createProfileFact({
    confirmed: true,
    initiatedBy: "agent",
    key: "target-role",
    reason: "test",
    source: "test",
    value: "后端工程师",
  });
  repository.saveJobPostingObservation({
    initiatedBy: "system",
    observation: {
      collectedAt: "2026-07-17T10:00:00.000Z",
      company: "星海科技",
      details: ["Node.js"],
      discoveryUrl: "https://www.zhipin.com/web/geek/jobs?query=Node.js",
      externalJobId: "mcp-example",
      jobUrl: "https://www.zhipin.com/job_detail/mcp-example.html",
      location: "北京",
      platformId: "boss",
      summary: "负责后端服务开发。",
      title: "后端开发",
    },
    reason: "test",
  });
}

// oxlint-disable-next-line max-lines-per-function, max-statements -- Representative validation failures share one lifecycle assertion.
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

    const unknownFieldResponse = await httpApp.request("/api/profile/facts", {
      body: JSON.stringify({
        confirmed: true,
        initiatedBy: "agent",
        key: "target-role",
        reason: "test",
        source: "test",
        unexpected: true,
        value: "后端工程师",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(unknownFieldResponse.status).toBe(badRequestStatus);

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

    const unknownNestedFieldResponse = await httpApp.request("/api/browser-session/status", {
      body: JSON.stringify({
        browserStatus: { available: true, tabCount: 1, unexpected: true },
        platformAccessObservations: [],
      }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    expect(unknownNestedFieldResponse.status).toBe(badRequestStatus);

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
    const initialProfile = (await initialProfileResponse.json()) as { id: number };
    const updatedProfileResponse = await httpApp.request(
      `/api/profile/facts/${String(initialProfile.id)}`,
      {
        body: JSON.stringify({
          confirmed: true,
          initiatedBy: "user",
          key: "target-position",
          reason: "test",
          source: "dashboard",
          value: "平台工程师",
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      },
    );
    expect(updatedProfileResponse.status).toBe(successfulStatus);
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
    const overview = WorkspaceOverview.assert(await overviewResponse.json());
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
          key: "target-position",
          source: "dashboard",
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

    const missingJobUrlResponse = await httpApp.request("/api/jobs", {
      body: JSON.stringify({
        collectedAt: "2026-07-17T10:00:00.000Z",
        details: [],
        discoveryUrl: "https://www.zhipin.com/web/geek/jobs",
        initiatedBy: "system",
        platformId: "boss",
        reason: "test",
        summary: "负责后端服务开发。",
        title: "后端开发",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(missingJobUrlResponse.status).toBe(badRequestStatus);

    const libraryResponse = await httpApp.request("/api/jobs?page=1&pageSize=1&platform=boss");
    const library = JobPostingPage.assert(await libraryResponse.json());
    expect(library).toMatchObject({
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
  seedMcpWorkspace(repository);

  try {
    const response = await mcpRequest(httpApp, {
      id: 1,
      method: "tools/call",
      params: { arguments: {}, name: "read_workspace_overview" },
    });
    expect(response.status).toBe(successfulStatus);
    expect(await response.json()).toMatchObject({
      result: { structuredContent: { profileFacts: [{ value: "后端工程师" }] } },
    });

    const libraryResponse = await mcpRequest(httpApp, {
      id: 2,
      method: "tools/call",
      params: {
        arguments: { page: 1, pageSize: 10, platformId: "boss", query: "后端" },
        name: "read_job_library",
      },
    });
    expect(await libraryResponse.json()).toMatchObject({
      result: {
        structuredContent: {
          jobs: [
            {
              sources: [
                {
                  discoveryUrl: "https://www.zhipin.com/web/geek/jobs?query=Node.js",
                  jobUrl: "https://www.zhipin.com/job_detail/mcp-example.html",
                },
              ],
              title: "后端开发",
            },
          ],
          page: 1,
          pageSize: 10,
          total: 1,
        },
      },
    });
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

test("writes and lists research reports through MCP", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const httpApp = createTestHttpApp(repository, serviceScope);

  try {
    const saveResponse = await mcpRequest(httpApp, {
      id: 1,
      method: "tools/call",
      params: {
        arguments: {
          initiatedBy: "agent",
          markdown: "## 推荐\n\n优先核验星海科技。",
          reason: "test",
          state: "complete",
          title: "岗位推荐",
        },
        name: "save_research_report",
      },
    });
    expect(await saveResponse.json()).toMatchObject({
      result: {
        structuredContent: {
          id: expect.any(Number),
          markdown: expect.stringContaining("星海科技"),
          title: "岗位推荐",
        },
      },
    });
    const listResponse = await mcpRequest(httpApp, {
      id: 2,
      method: "tools/call",
      params: { arguments: {}, name: "list_research_reports" },
    });
    expect(await listResponse.json()).toMatchObject({
      result: { structuredContent: { reports: [{ title: "岗位推荐" }] } },
    });
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

test("rejects an invalid report expiration through MCP", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const httpApp = createTestHttpApp(repository, serviceScope);

  try {
    const response = await mcpRequest(httpApp, {
      id: 1,
      method: "tools/call",
      params: {
        arguments: {
          expiresAt: "not-a-time",
          initiatedBy: "agent",
          markdown: "## 推荐",
          reason: "test",
          state: "complete",
          title: "无效报告",
        },
        name: "save_research_report",
      },
    });
    expect(await response.json()).toMatchObject({
      result: { isError: true },
    });
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

test("creates and reads research reports through HTTP", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const httpApp = createTestHttpApp(repository, serviceScope);

  try {
    const createResponse = await httpApp.request("/api/reports", {
      body: JSON.stringify({
        initiatedBy: "agent",
        markdown: "## 首选\n\n优先核验 Node.js 岗位。",
        reason: "test",
        state: "complete",
        title: "阶段推荐",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(createResponse.status).toBe(createdStatus);
    const created = ResearchReport.assert(await createResponse.json());

    const listResponse = await httpApp.request("/api/reports");
    expect(ResearchReportList.assert(await listResponse.json())).toMatchObject({
      reports: [{ id: created.id, title: "阶段推荐" }],
    });
    const detailResponse = await httpApp.request(`/api/reports/${String(created.id)}`);
    expect(ResearchReport.assert(await detailResponse.json())).toMatchObject({
      markdown: expect.stringContaining("Node.js"),
    });
    const invalidResponse = await httpApp.request("/api/reports", {
      body: JSON.stringify({
        initiatedBy: "agent",
        markdown: " ",
        reason: "test",
        state: "complete",
        title: "无效报告",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(invalidResponse.status).toBe(badRequestStatus);
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

test("advertises job-library filters by public tool name", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const httpApp = createTestHttpApp(repository, serviceScope);

  try {
    const toolsResponse = await mcpRequest(httpApp, { id: 1, method: "tools/list" });
    const toolsPayload = (await toolsResponse.json()) as {
      result: { tools: { inputSchema: object; name: string }[] };
    };
    expect(
      toolsPayload.result.tools.find(({ name }) => name === "read_workspace_overview"),
    ).toMatchObject({ inputSchema: { additionalProperties: false, type: "object" } });
    expect(toolsPayload.result.tools.find(({ name }) => name === "read_job_library")).toMatchObject(
      {
        inputSchema: {
          properties: {
            interestedOnly: { type: "boolean" },
            page: { minimum: 1, type: "integer" },
            pageSize: { maximum: 48, minimum: 1, type: "integer" },
            platformId: { enum: ["boss", "yupao"] },
            query: { type: "string" },
          },
        },
      },
    );
    expect(
      toolsPayload.result.tools.find(({ name }) => name === "save_research_report"),
    ).toMatchObject({
      inputSchema: {
        properties: {
          markdown: { type: "string" },
          state: { enum: ["complete", "draft"] },
          title: { type: "string" },
        },
        required: expect.arrayContaining(["markdown", "state", "title"]),
      },
    });
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

// eslint-disable-next-line max-lines-per-function -- One boundary flow covers accepted data, reads, and URL rejection.
test("synchronizes job interests and reads the interested slice through HTTP", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const httpApp = createTestHttpApp(repository, serviceScope);

  try {
    const response = await httpApp.request("/api/job-interests", {
      body: JSON.stringify({
        capturedAt: "2026-07-19T10:00:00.000Z",
        complete: true,
        initiatedBy: "system",
        jobs: [
          {
            company: "360集团",
            details: ["Node.js"],
            externalJobId: "agent",
            jobUrl: "https://www.zhipin.com/job_detail/agent.html",
            summary: "Agent 全栈",
            title: "高级全栈工程师",
          },
        ],
        platformId: "boss",
        reason: "test",
        sourceUrl: "https://www.zhipin.com/web/geek/recommend?tab=4&sub=1&page=1&tag=4",
        total: 1,
      }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    expect(response.status).toBe(successfulStatus);
    expect(await response.json()).toMatchObject({ observed: 1, platformId: "boss" });
    const listResponse = await httpApp.request("/api/jobs?interested=true");
    expect(JobPostingPage.assert(await listResponse.json())).toMatchObject({
      jobs: [
        {
          company: "360集团",
          sources: [{ interest: { position: 1 }, platformId: "boss" }],
        },
      ],
      total: 1,
    });

    const invalidResponse = await httpApp.request("/api/job-interests", {
      body: JSON.stringify({
        capturedAt: "2026-07-19T10:00:00.000Z",
        complete: true,
        initiatedBy: "system",
        jobs: [],
        platformId: "boss",
        reason: "test",
        sourceUrl: "https://example.invalid/interested",
        total: 0,
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

test("contains invalid and unknown MCP job-library input", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const httpApp = createTestHttpApp(repository, serviceScope);

  try {
    const invalidLibraryResponse = await mcpRequest(httpApp, {
      id: 1,
      method: "tools/call",
      params: {
        arguments: { pageSize: maximumPageSizePlusOne },
        name: "read_job_library",
      },
    });
    expect(await invalidLibraryResponse.json()).toMatchObject({
      result: {
        content: [{ text: expect.stringMatching(/pageSize/u), type: "text" }],
        isError: true,
      },
    });
    const unknownArgumentResponse = await mcpRequest(httpApp, {
      id: 2,
      method: "tools/call",
      params: {
        arguments: { platform: "boss" },
        name: "read_job_library",
      },
    });
    expect(await unknownArgumentResponse.json()).toMatchObject({
      result: {
        content: [{ text: expect.stringMatching(/platform/u), type: "text" }],
        isError: true,
      },
    });
    const followingOverviewResponse = await httpApp.request("/api/workspace/overview");
    expect(followingOverviewResponse.status).toBe(successfulStatus);
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

test("contains unexpected MCP read failures without exposing repository details", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const httpApp = createTestHttpApp(repository, serviceScope);
  repository.close();

  try {
    const response = await mcpRequest(httpApp, {
      id: 1,
      method: "tools/call",
      params: { arguments: {}, name: "read_job_library" },
    });
    expect(await response.json()).toMatchObject({
      result: {
        content: [{ text: "Workspace Service 无法完成工作区请求。", type: "text" }],
        isError: true,
      },
    });
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("rejects an unknown MCP resource without failing the service scope", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const httpApp = createTestHttpApp(repository, serviceScope);

  try {
    const response = await mcpRequest(httpApp, {
      id: 1,
      method: "resources/read",
      params: { uri: "job-boardwalk://unknown" },
    });
    expect(await response.json()).toMatchObject({
      error: { message: expect.stringMatching(/未知的 Job Boardwalk 资源/u) },
    });
    const followingOverviewResponse = await httpApp.request("/api/workspace/overview");
    expect(followingOverviewResponse.status).toBe(successfulStatus);
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});
