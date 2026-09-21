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
