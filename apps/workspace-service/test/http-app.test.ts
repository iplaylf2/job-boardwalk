import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { createWorkspaceServiceHttpApp } from "#/http/app.js";
import { WorkspaceRepository } from "#/persistence/workspace-repository.js";

const badRequestStatus = 400;
const createdStatus = 201;
const successfulStatus = 200;
const forbiddenStatus = 403;
const internalServerErrorStatus = 500;
const mcpRequestHeaders = {
  accept: "application/json, text/event-stream",
  "content-type": "application/json",
};
const defaultPlatformAccessAssessment = {
  authenticationState: "authenticated",
  evidence: "account-identity",
};

function postPlatformAccessObservation(
  httpApp: ReturnType<typeof createWorkspaceServiceHttpApp>,
  input: Record<string, unknown> = defaultPlatformAccessAssessment,
) {
  return httpApp.request("/api/platform-access/observations", {
    body: JSON.stringify({
      observedAt: "2026-07-13T01:00:00+00:00",
      platformId: "boss",
      ...input,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

test("keeps request errors inside the long-lived service scope", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = new WorkspaceRepository(path.join(directory, "workspace.sqlite"));
  await using serviceScope = createScope();
  const httpApp = createWorkspaceServiceHttpApp(repository, serviceScope);

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
  const repository = new WorkspaceRepository(path.join(directory, "workspace.sqlite"));
  await using serviceScope = createScope();
  const httpApp = createWorkspaceServiceHttpApp(repository, serviceScope);
  repository.close();

  try {
    const response = await httpApp.request("/api/workspace/overview");
    expect(response.status).toBe(internalServerErrorStatus);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("rejects writes from a non-local web origin", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = new WorkspaceRepository(path.join(directory, "workspace.sqlite"));
  await using serviceScope = createScope();
  const httpApp = createWorkspaceServiceHttpApp(repository, serviceScope);

  try {
    const response = await httpApp.request("/api/profile/facts", {
      body: JSON.stringify({
        confirmed: true,
        key: "target-role",
        reason: "test",
        source: "test",
        value: "后端工程师",
      }),
      headers: { "content-type": "application/json", origin: "https://example.invalid" },
      method: "POST",
    });
    expect(response.status).toBe(forbiddenStatus);
    expect(await response.json()).toEqual({ error: "拒绝来自非本地页面的请求" });
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

test("accepts and projects the latest durable platform access observation", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = new WorkspaceRepository(path.join(directory, "workspace.sqlite"));
  await using serviceScope = createScope();
  const httpApp = createWorkspaceServiceHttpApp(repository, serviceScope);

  try {
    const observationResponse = await postPlatformAccessObservation(httpApp);
    expect(observationResponse.status).toBe(createdStatus);
    expect(await observationResponse.json()).toMatchObject({
      authenticationState: "authenticated",
      observedAt: "2026-07-13T01:00:00.000Z",
      platformId: "boss",
    });

    const overviewResponse = await httpApp.request("/api/workspace/overview");
    expect(await overviewResponse.json()).toMatchObject({
      platformAccessSummaries: [
        {
          label: "BOSS直聘",
          latestAuthentication: {
            authenticationState: "authenticated",
            evidence: "account-identity",
          },
          platformId: "boss",
        },
        { label: "鱼泡直聘", platformId: "yupao" },
      ],
    });

    const invalidResponse = await postPlatformAccessObservation(httpApp, {
      authenticationState: "definitely-logged-in",
      evidence: "account-identity",
    });
    expect(invalidResponse.status).toBe(badRequestStatus);

    const mismatchedEvidenceResponse = await postPlatformAccessObservation(httpApp, {
      authenticationState: "authenticated",
      evidence: "login-page",
    });
    expect(mismatchedEvidenceResponse.status).toBe(badRequestStatus);
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

test("serves MCP from the same workspace state", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const repository = new WorkspaceRepository(path.join(directory, "workspace.sqlite"));
  await using serviceScope = createScope();
  const httpApp = createWorkspaceServiceHttpApp(repository, serviceScope);
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
