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
const migrationsDirectory = path.resolve(import.meta.dirname, "../migrations");

function createTestRepository(directory: string): WorkspaceRepository {
  return new WorkspaceRepository({
    databasePath: path.join(directory, "workspace.sqlite"),
    migrationsDirectory,
  });
}

function createTestHttpApp(
  repository: WorkspaceRepository,
  serviceScope: ReturnType<typeof createScope>,
) {
  return createWorkspaceServiceHttpApp({
    browserSessionPresenceTracker: new BrowserSessionPresenceTracker(),
    repository,
    serviceScope,
  });
}

function postObservation(
  httpApp: ReturnType<typeof createWorkspaceServiceHttpApp>,
  input: Record<string, unknown>,
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

async function readBossSummary(httpApp: ReturnType<typeof createWorkspaceServiceHttpApp>) {
  const response = await httpApp.request("/api/workspace/overview");
  const overview = await response.json();
  return overview.platformAccessSummaries.find(
    (summary: { platformId: string }) => summary.platformId === "boss",
  );
}

test("validates and projects durable platform access observations", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-platform-access-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const httpApp = createTestHttpApp(repository, serviceScope);

  try {
    const observationResponse = await postObservation(httpApp, {
      authenticationState: "authenticated",
      evidence: "account-identity",
    });
    expect(observationResponse.status).toBe(createdStatus);
    expect(await readBossSummary(httpApp)).toMatchObject({
      label: "BOSS直聘",
      latestAuthentication: {
        authenticationState: "authenticated",
        evidence: "account-identity",
      },
      platformId: "boss",
    });

    const invalidResponse = await postObservation(httpApp, {
      authenticationState: "definitely-logged-in",
      evidence: "account-identity",
    });
    expect(invalidResponse.status).toBe(badRequestStatus);
    const mismatchedEvidenceResponse = await postObservation(httpApp, {
      authenticationState: "authenticated",
      evidence: "login-page",
    });
    expect(mismatchedEvidenceResponse.status).toBe(badRequestStatus);
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

test("shows only interruptions newer than the latest authentication", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-platform-access-"));
  const repository = createTestRepository(directory);
  await using serviceScope = createScope();
  const httpApp = createTestHttpApp(repository, serviceScope);

  try {
    await postObservation(httpApp, {
      authenticationState: "authenticated",
      evidence: "account-identity",
    });
    await postObservation(httpApp, {
      evidence: "verification-page",
      interruption: "verification-required",
      observedAt: "2026-07-13T01:01:00+00:00",
    });
    expect(await readBossSummary(httpApp)).toMatchObject({
      unresolvedInterruption: { interruption: "verification-required" },
    });

    await postObservation(httpApp, {
      authenticationState: "authenticated",
      evidence: "account-identity",
      observedAt: "2026-07-13T01:02:00+00:00",
    });
    expect(await readBossSummary(httpApp)).not.toHaveProperty("unresolvedInterruption");
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});
