import path from "node:path";
import { expect, test } from "vitest";
import { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import { readWorkspaceOverview } from "#/read-model/workspace-overview.js";

test("retains and reconciles observations independently for each source URL", () => {
  const repository = new WorkspaceRepository({
    databasePath: ":memory:",
    migrationsDirectory: path.resolve(import.meta.dirname, "../migrations"),
  });
  const distinctSources = 2;
  const retainedTransitions = 3;
  const search = "https://www.zhipin.com/web/geek/jobs";
  const detail = "https://www.zhipin.com/job_detail/synthetic-access.html";
  function summary() {
    return readWorkspaceOverview(repository).platformAccessSummaries.find(
      ({ platformId }) => platformId === "boss",
    );
  }
  try {
    repository.reconcilePlatformAccessObservation({
      authenticationState: "authenticated",
      evidence: "authenticated-page",
      observedAt: "2026-09-01T02:00:00.000Z",
      platformId: "boss",
      url: search,
    });
    repository.reconcilePlatformAccessObservation({
      evidence: "verification-page",
      interruption: "verification-required",
      observedAt: "2026-09-01T01:00:00.000Z",
      platformId: "boss",
      url: detail,
    });
    expect(repository.listPlatformAccessObservations()).toHaveLength(distinctSources);
    expect(repository.listPlatformAccessObservations()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ observedAt: "2026-09-01T02:00:00.000Z", url: search }),
        expect.objectContaining({ observedAt: "2026-09-01T01:00:00.000Z", url: detail }),
      ]),
    );
    expect(summary()).toMatchObject({
      latestAuthentication: { url: search },
    });
    repository.reconcilePlatformAccessObservation({
      authenticationState: "authenticated",
      evidence: "authenticated-page",
      observedAt: "2026-09-01T01:30:00.000Z",
      platformId: "boss",
      url: detail,
    });
    expect(summary()?.latestAuthentication?.url).toBe(search);
    repository.reconcilePlatformAccessObservation({
      evidence: "verification-page",
      interruption: "verification-required",
      observedAt: "2026-09-01T01:15:00.000Z",
      platformId: "boss",
      url: detail,
    });
    expect(repository.listPlatformAccessObservations()).toHaveLength(retainedTransitions);
  } finally {
    repository.close();
  }
});
