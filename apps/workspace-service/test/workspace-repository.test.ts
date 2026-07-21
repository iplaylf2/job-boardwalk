// oxlint-disable max-lines -- Repository behavior remains visible in one boundary-level suite.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "vitest";
import type { JobPostingObservation } from "@job-boardwalk/contracts";

import { WorkspaceRepository } from "#/persistence/workspace-repository.js";

const migrationsDirectory = path.resolve(import.meta.dirname, "../migrations");
const filterPageSize = 10;
const emptyCount = 0;
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

// eslint-disable-next-line max-lines-per-function -- One report lifecycle keeps all persistence outcomes together.
test("creates, updates, expires, and deletes research reports", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-workspace-service-"));
  const repository = new WorkspaceRepository({
    databasePath: path.join(directory, "workspace.sqlite"),
    migrationsDirectory,
  });

  try {
    const created = repository.saveResearchReport({
      expiresAt: "2999-07-20T00:00:00.000Z",
      initiatedBy: "agent",
      markdown: "## 初步判断",
      reason: "test",
      state: "draft",
      title: "岗位推荐",
    });
    expect(created).toMatchObject({ id: expect.any(Number), state: "draft" });
    if (!created) {
      throw new Error("test report was not created");
    }

    expect(repository.listResearchReports()).toEqual([
      expect.objectContaining({ id: created.id, title: "岗位推荐" }),
    ]);
    expect(
      repository.saveResearchReport({
        id: created.id,
        initiatedBy: "agent",
        markdown: "## 最终判断",
        reason: "test",
        state: "complete",
        title: "岗位推荐",
      }),
    ).toMatchObject({ markdown: "## 最终判断", state: "complete" });
    expect(repository.readResearchReport(created.id)).toMatchObject({ state: "complete" });
    expect(
      repository.deleteResearchReport({ id: created.id, initiatedBy: "user", reason: "test" }),
    ).toBe(true);
    expect(repository.readResearchReport(created.id)).toBeNull();

    const expired = repository.saveResearchReport({
      expiresAt: "2000-07-18T00:00:00.000Z",
      initiatedBy: "system",
      markdown: "已过期",
      reason: "test",
      state: "complete",
      title: "旧报告",
    });
    expect(expired).toMatchObject({ id: expect.any(Number) });
    if (!expired) {
      throw new Error("test expired report was not created");
    }
    expect(repository.listResearchReports()).toEqual([]);
    expect(repository.readResearchReport(expired.id)).toBeNull();
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

// eslint-disable-next-line max-lines-per-function -- One lifecycle proves relation replacement without deleting job facts.
test("replaces reversible interest engagements without removing jobs from the library", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-workspace-service-"));
  const repository = new WorkspaceRepository({
    databasePath: path.join(directory, "workspace.sqlite"),
    migrationsDirectory,
  });

  try {
    const first = repository.synchronizeJobEngagement({
      initiatedBy: "system",
      reason: "test",
      snapshot: {
        capturedAt: "2026-07-19T10:00:00.000Z",
        complete: true,
        engagement: "interested",
        jobs: [
          {
            company: "360集团",
            details: ["Node.js"],
            externalJobId: "agent",
            jobUrl: "https://www.zhipin.com/job_detail/agent.html",
            summary: "Agent 全栈",
            title: "高级全栈工程师",
          },
          {
            company: "博趣互动",
            details: ["C#"],
            externalJobId: "server",
            jobUrl: "https://www.zhipin.com/job_detail/server.html",
            summary: "服务器开发",
            title: "高级服务器开发工程师",
          },
        ],
        platformId: "boss",
        sourceUrl: "https://www.zhipin.com/web/geek/recommend?tab=4&sub=1&page=1&tag=4",
        total: 2,
      },
    });
    expect(first).toMatchObject({ complete: true, observed: 2, removed: 0 });
    const agentInterest = expect.objectContaining({
      engagements: [
        expect.objectContaining({
          firstObservedAt: "2026-07-19T10:00:00.000Z",
          kind: "interested",
        }),
      ],
      externalJobId: "agent",
    });
    const serverInterest = expect.objectContaining({
      engagements: [expect.objectContaining({ kind: "interested" })],
      externalJobId: "server",
    });
    const interestedPage = repository.listJobPostingPage({
      engagement: "interested",
      page: firstPage,
      pageSize: filterPageSize,
    });
    expect(interestedPage).toMatchObject({
      jobs: expect.arrayContaining([
        expect.objectContaining({ sources: [agentInterest] }),
        expect.objectContaining({ sources: [serverInterest] }),
      ]),
      total: twoJobs,
    });

    const second = repository.synchronizeJobEngagement({
      initiatedBy: "system",
      reason: "test",
      snapshot: {
        capturedAt: "2026-07-19T11:00:00.000Z",
        complete: false,
        engagement: "interested",
        jobs: [
          {
            company: "博趣互动",
            details: ["C#", "MySQL"],
            externalJobId: "server",
            jobUrl: "https://www.zhipin.com/job_detail/server.html",
            summary: "服务器开发",
            title: "高级服务器开发工程师",
          },
        ],
        platformId: "boss",
        sourceUrl: "https://www.zhipin.com/web/geek/recommend?tab=4&sub=1&page=1&tag=4",
        total: 1,
      },
    });
    expect(second).toMatchObject({ complete: false, observed: 1, removed: 0 });
    expect(
      repository.listJobPostingPage({ engagement: "interested", page: 1, pageSize: 10 }),
    ).toMatchObject({ total: twoJobs });

    const third = repository.synchronizeJobEngagement({
      initiatedBy: "system",
      reason: "test",
      snapshot: {
        capturedAt: "2026-07-19T12:00:00.000Z",
        complete: true,
        engagement: "interested",
        jobs: [
          {
            company: "博趣互动",
            details: ["C#", "MySQL"],
            externalJobId: "server",
            jobUrl: "https://www.zhipin.com/job_detail/server.html",
            summary: "服务器开发",
            title: "高级服务器开发工程师",
          },
        ],
        platformId: "boss",
        sourceUrl: "https://www.zhipin.com/web/geek/recommend?tab=4&sub=1&page=1&tag=4",
        total: 1,
      },
    });
    expect(third).toMatchObject({ complete: true, observed: 1, removed: 1 });
    expect(
      repository.listJobPostingPage({ engagement: "interested", page: 1, pageSize: 10 }),
    ).toMatchObject({
      jobs: [
        {
          sources: [
            {
              engagements: [
                {
                  firstObservedAt: "2026-07-19T10:00:00.000Z",
                  kind: "interested",
                  lastObservedAt: "2026-07-19T12:00:00.000Z",
                },
              ],
              externalJobId: "server",
            },
          ],
        },
      ],
      total: 1,
    });
    const completeLibrary = repository.listJobPostingPage({ page: 1, pageSize: 10 });
    expect(completeLibrary.total).toBe(twoJobs);
    expect(
      completeLibrary.jobs
        .flatMap(({ sources }) => sources)
        .find(({ externalJobId }) => externalJobId === "agent"),
    ).toMatchObject({ engagements: [] });
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});

// eslint-disable-next-line max-lines-per-function -- One lifecycle proves historical engagement retention.
test("preserves historical job engagements when later complete lists omit them", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-workspace-service-"));
  const repository = new WorkspaceRepository({
    databasePath: path.join(directory, "workspace.sqlite"),
    migrationsDirectory,
  });

  try {
    repository.synchronizeJobEngagement({
      initiatedBy: "system",
      reason: "test",
      snapshot: {
        capturedAt: "2026-07-19T10:00:00.000Z",
        complete: true,
        engagement: "contacted",
        jobs: [
          {
            company: "星海科技",
            details: [],
            externalJobId: "contacted-job",
            jobUrl: "https://www.zhipin.com/job_detail/contacted-job.html",
            summary: "平台沟通过岗位",
            title: "后端开发",
          },
        ],
        platformId: "boss",
        sourceUrl: "https://www.zhipin.com/web/geek/recommend?tab=1&sub=1&page=1&tag=4",
        total: 1,
      },
    });
    const emptySnapshot = repository.synchronizeJobEngagement({
      initiatedBy: "system",
      reason: "test",
      snapshot: {
        capturedAt: "2026-07-20T10:00:00.000Z",
        complete: true,
        engagement: "contacted",
        jobs: [],
        platformId: "boss",
        sourceUrl: "https://www.zhipin.com/web/geek/recommend?tab=1&sub=1&page=1&tag=4",
        total: 0,
      },
    });

    expect(emptySnapshot.removed).toBe(emptyCount);
    expect(
      repository.listJobPostingPage({ engagement: "contacted", page: 1, pageSize: 10 }),
    ).toMatchObject({
      jobs: [
        {
          sources: [
            {
              engagements: [expect.objectContaining({ kind: "contacted" })],
            },
          ],
        },
      ],
      total: 1,
    });
  } finally {
    repository.close();
    await rm(directory, { recursive: true });
  }
});
