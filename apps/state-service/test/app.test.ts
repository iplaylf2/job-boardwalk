import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { createStateServiceApp } from "#/app.js";
import { WorkspaceDatabase } from "#/database.js";

const badRequestStatus = 400;
const successfulStatus = 200;

test("keeps request errors inside the long-lived service scope", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-routes-"));
  const database = new WorkspaceDatabase(path.join(directory, "workspace.sqlite"));
  await using serviceScope = createScope();
  const app = createStateServiceApp(database, serviceScope);

  try {
    const invalidResponse = await app.request("/api/search-intent/locations", {
      body: "not-json",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(invalidResponse.status).toBe(badRequestStatus);

    const followingResponse = await app.request("/api/workspace");
    expect(followingResponse.status).toBe(successfulStatus);
  } finally {
    database.close();
    await rm(directory, { recursive: true });
  }
});
