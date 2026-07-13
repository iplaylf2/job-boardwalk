import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { WorkspaceRepository } from "#/persistence/workspace-repository.js";

const firstArrayIndex = 0;
const temporaryDirectories: string[] = [];

async function repositoryFixture(): Promise<WorkspaceRepository> {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-dashboard-"));
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

  test("keeps the latest platform authentication observation", async () => {
    const repository = await repositoryFixture();
    repository.recordAuthenticationObservation("boss", "2026-07-12T10:00:00.000Z");
    repository.recordAuthenticationObservation("boss", "2026-07-11T10:00:00.000Z");

    expect(repository.getAuthenticationObservation("boss")).toEqual({
      observedAt: "2026-07-12T10:00:00.000Z",
    });
    repository.close();
  });
});
