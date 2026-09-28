import path from "node:path";

import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { createWorkspaceServiceHttpApp } from "#/http/app.js";
import { WorkspaceRepository } from "#/persistence/workspace-repository.js";

const badRequestStatus = 400;
const migrationsDirectory = path.resolve(import.meta.dirname, "../migrations");

test.each([
  { evidence: "process-started" },
  { browserStatus: { available: true } },
  { url: null },
  { url: "http://www.zhipin.com/" },
])("rejects invalid access evidence or runtime metadata: %j", async (extra) => {
  const repository = new WorkspaceRepository({ databasePath: ":memory:", migrationsDirectory });
  await using serviceScope = createScope();
  const httpApp = createWorkspaceServiceHttpApp({ repository, serviceScope });
  try {
    const response = await httpApp.request("/api/platform-access/observations", {
      body: JSON.stringify({
        authenticationState: "authenticated",
        evidence: "protected-resource",
        observedAt: "2026-07-15T02:00:00.000Z",
        platformId: "boss",
        url: "https://www.zhipin.com/web/geek/jobs",
        ...extra,
      }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    expect(response.status).toBe(badRequestStatus);
    expect(repository.listPlatformAccessObservations()).toEqual([]);
  } finally {
    repository.close();
  }
});

test("retains a dated page login restriction independently of historical authentication", async () => {
  const repository = new WorkspaceRepository({ databasePath: ":memory:", migrationsDirectory });
  await using serviceScope = createScope();
  const app = createWorkspaceServiceHttpApp({ repository, serviceScope });
  try {
    repository.recordPlatformAccessObservation({
      authenticationState: "authenticated",
      evidence: "authenticated-page",
      observedAt: "2026-01-01T00:00:00.000Z",
      platformId: "boss",
      url: "https://www.zhipin.com/web/geek/jobs",
    });
    const observation = {
      authenticationState: "unauthenticated",
      evidence: "login-required-page",
      observedAt: "2026-01-02T00:00:00.000Z",
      platformId: "boss",
      url: "https://www.zhipin.com/web/geek/job-recommend",
    };
    const response = await app.request("/api/platform-access/observations", {
      body: JSON.stringify(observation),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    expect(response.ok).toBe(true);
    const overview = await app.request("/api/workspace/overview");
    const result = (await overview.json()) as { platformAccessSummaries: unknown[] };
    const expected = expect.objectContaining({
      latestAuthentication: expect.objectContaining(observation),
    });
    expect(result.platformAccessSummaries).toContainEqual(expected);
    expect(repository.listPlatformAccessObservations()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ authenticationState: "authenticated" }),
        expect.objectContaining(observation),
      ]),
    );
  } finally {
    repository.close();
  }
});
