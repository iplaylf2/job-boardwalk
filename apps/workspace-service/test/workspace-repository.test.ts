import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import { WorkspaceRepository } from "#/persistence/workspace-repository.js";

const migrationsDirectory = path.resolve(import.meta.dirname, "../migrations");

test("keeps authentication and interruption observations as separate history", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-workspace-service-"));
  const repository = new WorkspaceRepository({
    databasePath: path.join(directory, "workspace.sqlite"),
    migrationsDirectory,
  });

  try {
    repository.recordPlatformAccessObservation({
      authenticationState: "authenticated",
      evidence: "protected-resource",
      observedAt: "2026-07-13T01:01:00.000Z",
      platformId: "boss",
    });
    repository.recordPlatformAccessObservation({
      authenticationState: "unauthenticated",
      evidence: "login-redirect",
      observedAt: "2026-07-13T01:02:00.000Z",
      platformId: "yupao",
    });
    repository.recordPlatformAccessObservation({
      evidence: "verification-page",
      interruption: "verification-required",
      observedAt: "2026-07-13T01:03:00.000Z",
      platformId: "yupao",
    });
    expect(repository.listPlatformAccessObservations()).toEqual([
      expect.objectContaining({
        authenticationState: "authenticated",
        platformId: "boss",
      }),
      expect.objectContaining({
        interruption: "verification-required",
        platformId: "yupao",
      }),
      expect.objectContaining({
        authenticationState: "unauthenticated",
        platformId: "yupao",
      }),
    ]);
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

// oxlint-disable-next-line max-lines-per-function -- One aggregate flow proves source ownership and selection.
test("keeps one selected job-search intent with platform source associations", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-workspace-service-"));
  const repository = new WorkspaceRepository({
    databasePath: path.join(directory, "workspace.sqlite"),
    migrationsDirectory,
  });

  try {
    const nodeIntent = repository.saveJobSearchIntent({
      city: "北京",
      initiatedBy: "user",
      name: "北京 Node.js",
      position: "Node.js",
      reason: "test",
      selected: true,
      sources: [
        {
          label: "Node.js(北京)",
          platformId: "boss",
          url: "https://www.zhipin.com/web/geek/jobs",
        },
        {
          label: "北京后端开发",
          platformId: "yupao",
          url: "https://www.yupao.com/topic/a2c1488/",
        },
      ],
    });
    const csharpIntent = repository.saveJobSearchIntent({
      city: "北京",
      initiatedBy: "user",
      name: "北京 C#",
      position: "C#",
      reason: "test",
      selected: false,
      sources: [
        {
          label: "C#(北京)",
          platformId: "boss",
          url: "https://www.zhipin.com/web/geek/jobs",
        },
      ],
    });

    repository.selectJobSearchIntent({
      id: csharpIntent.id,
      initiatedBy: "user",
      reason: "test",
    });

    expect(repository.listJobSearchIntents()).toEqual([
      expect.objectContaining({
        id: csharpIntent.id,
        selected: true,
      }),
      expect.objectContaining({
        id: nodeIntent.id,
        selected: false,
        sources: [
          expect.objectContaining({ platformId: "boss" }),
          expect.objectContaining({ platformId: "yupao" }),
        ],
      }),
    ]);
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});
