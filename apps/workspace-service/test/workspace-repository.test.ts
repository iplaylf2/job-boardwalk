import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { WorkspaceRepository } from "#/persistence/workspace-repository.js";

const firstArrayIndex = 0;
const temporaryDirectories: string[] = [];

async function repositoryFixture(): Promise<WorkspaceRepository> {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-workspace-service-"));
  temporaryDirectories.push(directory);
  return new WorkspaceRepository(path.join(directory, "workspace.sqlite"));
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(firstArrayIndex)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe("workspace repository", () => {
  test("persists agent-authored profile facts", async () => {
    const repository = await repositoryFixture();
    repository.setProfileFact({
      confirmed: true,
      key: "target-role",
      reason: "用户明确说明目标岗位",
      source: "conversation",
      value: "后端工程师",
    });

    expect(repository.listProfileFacts()).toMatchObject([
      {
        confirmed: true,
        key: "target-role",
        source: "conversation",
        value: "后端工程师",
      },
    ]);
    repository.close();
  });
});

describe("platform access observations", () => {
  test("keeps history and projects the latest access observation per platform", async () => {
    const repository = await repositoryFixture();
    repository.recordPlatformAccessObservation({
      browserSessionId: "browser-session-a",
      evidence: "authentication-cookie",
      observedAt: "2026-07-13T01:00:00.000Z",
      platformId: "boss",
      state: "authentication-unverified",
    });
    repository.recordPlatformAccessObservation({
      accountDisplayName: "求职者 A",
      browserSessionId: "browser-session-a",
      evidence: "account-identity",
      observedAt: "2026-07-13T01:01:00.000Z",
      platformId: "boss",
      state: "authenticated",
    });
    repository.recordPlatformAccessObservation({
      browserSessionId: "browser-session-b",
      evidence: "login-page",
      observedAt: "2026-07-13T01:02:00.000Z",
      platformId: "yupao",
      state: "login-required",
    });

    expect(repository.listLatestPlatformAccessObservations()).toEqual([
      expect.objectContaining({
        accountDisplayName: "求职者 A",
        browserSessionId: "browser-session-a",
        platformId: "boss",
        state: "authenticated",
      }),
      expect.objectContaining({
        browserSessionId: "browser-session-b",
        platformId: "yupao",
        state: "login-required",
      }),
    ]);
    repository.close();
  });
});
