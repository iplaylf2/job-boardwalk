import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "vitest";
import type { JobPostingObservation } from "@job-boardwalk/contracts";

import { WorkspaceRepository } from "#/persistence/workspace-repository.js";

const migrationsDirectory = path.resolve(import.meta.dirname, "../migrations");
const filterPageSize = 10;
const firstPage = 1;
const singleJob = 1;
const twoJobs = 2;
function jobPostingObservation(
  platformId: "boss" | "yupao",
  overrides: Partial<{
    company: string | null;
    externalJobId: string;
    jobUrl: string;
    collectedAt: string;
    location: string | null;
    title: string;
  }> = {},
): JobPostingObservation {
  return {
    collectedAt: overrides.collectedAt ?? "2026-07-17T10:00:00.000Z",
    ...(overrides.company === null ? {} : { company: overrides.company ?? "星海科技有限公司" }),
    details: ["Node.js", "TypeScript"],
    discoveryUrl:
      platformId === "boss"
        ? "https://www.zhipin.com/web/geek/jobs"
        : "https://www.yupao.com/topic/a2c1488/",
    ...(overrides.externalJobId ? { externalJobId: overrides.externalJobId } : {}),
    jobUrl:
      overrides.jobUrl ??
      (platformId === "boss"
        ? "https://www.zhipin.com/job_detail/example.html"
        : "https://www.yupao.com/zhaogong/123456789.html"),
    ...(overrides.location === null ? {} : { location: overrides.location ?? "北京" }),
    platformId,
    salaryText: "20-30K",
    summary: "负责后端服务和平台能力建设。",
    title: overrides.title ?? "后端开发",
  };
}

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
test("keeps one selected job-search intent with recommendation pages", async () => {
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
      recommendationPages: [
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
      selected: true,
    });
    const csharpIntent = repository.saveJobSearchIntent({
      city: "北京",
      initiatedBy: "user",
      name: "北京 C#",
      position: "C#",
      reason: "test",
      recommendationPages: [
        {
          label: "C#(北京)",
          platformId: "boss",
          url: "https://www.zhipin.com/web/geek/jobs",
        },
      ],
      selected: false,
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
        recommendationPages: [
          expect.objectContaining({ platformId: "boss" }),
          expect.objectContaining({ platformId: "yupao" }),
        ],
        selected: false,
      }),
    ]);
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

test("merges high-confidence postings and skips unchanged page observations", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-workspace-service-"));
  const repository = new WorkspaceRepository({
    databasePath: path.join(directory, "workspace.sqlite"),
    migrationsDirectory,
  });

  try {
    const firstSave = repository.saveJobPostingObservation({
      initiatedBy: "system",
      observation: jobPostingObservation("boss", { externalJobId: "boss-123" }),
      reason: "test",
    });
    expect(firstSave.outcome).toBe("created");

    const secondSource = repository.saveJobPostingObservation({
      initiatedBy: "system",
      observation: jobPostingObservation("yupao", {
        collectedAt: "2026-07-17T10:10:00.000Z",
        company: "星海科技",
        title: "【急聘】后端开发",
      }),
      reason: "test",
    });
    expect(secondSource).toMatchObject({
      job: { id: firstSave.job.id, sources: [{ platformId: "boss" }, { platformId: "yupao" }] },
      outcome: "source-added",
    });
    expect(
      repository.saveJobPostingObservation({
        initiatedBy: "system",
        observation: jobPostingObservation("boss", {
          collectedAt: "2026-07-17T11:00:00.000Z",
          externalJobId: "boss-123",
          jobUrl: "https://www.zhipin.com/job_detail/example.html?from=recommend",
        }),
        reason: "test",
      }).outcome,
    ).toBe("unchanged");
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

test("keeps partial cross-platform cards separate", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-workspace-service-"));
  const repository = new WorkspaceRepository({
    databasePath: path.join(directory, "workspace.sqlite"),
    migrationsDirectory,
  });

  try {
    for (const platformId of ["boss", "yupao"] as const) {
      repository.saveJobPostingObservation({
        initiatedBy: "system",
        observation: jobPostingObservation(platformId, { company: null, location: null }),
        reason: "test",
      });
    }
    expect(repository.listJobPostings()).toHaveLength(twoJobs);
    expect(repository.listJobPostingPage({ page: firstPage, pageSize: singleJob })).toMatchObject({
      jobs: [expect.any(Object)],
      page: firstPage,
      pageCount: twoJobs,
      pageSize: singleJob,
      total: twoJobs,
    });
    expect(
      repository.listJobPostingPage({
        page: firstPage,
        pageSize: filterPageSize,
        platformId: "boss",
      }),
    ).toMatchObject({
      jobs: [{ sources: [{ platformId: "boss" }] }],
      total: singleJob,
    });
    expect(
      repository.listJobPostingPage({
        page: firstPage,
        pageSize: filterPageSize,
        query: "后端",
      }).total,
    ).toBe(twoJobs);
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});
