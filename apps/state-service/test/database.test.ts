import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { WorkspaceDatabase } from "#/database.js";

const firstArrayIndex = 0;
const temporaryDirectories: string[] = [];

async function databaseFixture(): Promise<WorkspaceDatabase> {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-dashboard-"));
  temporaryDirectories.push(directory);
  return new WorkspaceDatabase(path.join(directory, "workspace.sqlite"));
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(firstArrayIndex)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe("local state database", () => {
  test("persists agent-authored profile facts", async () => {
    const database = await databaseFixture();
    database.setProfileFact({
      confirmed: true,
      key: "target-role",
      reason: "用户明确说明目标岗位",
      source: "conversation",
      value: "后端工程师",
    });

    expect(database.listProfileFacts()).toMatchObject([
      {
        confirmed: true,
        key: "target-role",
        source: "conversation",
        value: "后端工程师",
      },
    ]);
    database.close();
  });

  test("keeps the latest platform authentication", async () => {
    const database = await databaseFixture();
    database.recordPlatformAuthentication("boss", "2026-07-12T10:00:00.000Z");
    database.recordPlatformAuthentication("boss", "2026-07-11T10:00:00.000Z");

    expect(database.getPlatformAuthenticationState("boss")).toEqual({
      authenticatedAt: "2026-07-12T10:00:00.000Z",
    });
    database.close();
  });
});
