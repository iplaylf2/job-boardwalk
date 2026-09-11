import path from "node:path";
import { createScope } from "@shajara/host";
import { ResearchReport, ResearchReportList } from "@job-boardwalk/contracts";
import type { SaveResearchReportCommand } from "@job-boardwalk/contracts";
import { expect, test } from "vitest";
import { createWorkspaceServiceHttpApp } from "#/http/app.js";
import { WorkspaceRepository } from "#/persistence/workspace-repository.js";

const ok = 200;
const created = 201;
const badRequest = 400;
const missing = 404;
const firstIndex = 0;
const missingSourceId = 999_999;
const assessedAt = "2026-08-01T00:00:00.000Z";
const command: SaveResearchReportCommand = {
  entries: [],
  initiatedBy: "agent",
  markdown: "合成报告：正文提及不代表推荐。",
  reason: "合成研究测试",
  state: "complete",
  targets: [],
  title: "合成岗位研究",
};

function setup() {
  const repository = new WorkspaceRepository({
    databasePath: ":memory:",
    migrationsDirectory: path.resolve(import.meta.dirname, "../migrations"),
  });
  for (const platformId of ["boss", "yupao"] as const) {
    repository.saveJobCardObservation({
      initiatedBy: "agent",
      observation: {
        company: "合成雇主甲",
        details: [],
        discoveryUrl:
          platformId === "boss"
            ? "https://www.zhipin.com/web/geek/jobs"
            : "https://www.yupao.com/zhaogong/",
        externalJobId: "synthetic-job",
        location: "合成城市",
        observedAt: assessedAt,
        platformId,
        summary: "合成工作内容",
        title: "合成后端岗位",
      },
      reason: "合成研究测试",
    });
  }
  const [job] = repository.listJobPostings();
  if (!job) {
    throw new Error("合成岗位未保存");
  }
  const boss = job.sources.find(({ platformId }) => platformId === "boss");
  const yupao = job.sources.find(({ platformId }) => platformId === "yupao");
  if (!boss || !yupao) {
    throw new Error("合成平台来源未归并");
  }
  return { boss, repository, yupao };
}

function reportEntry(sourceId: number, disposition: "recommended" | "pending" | "excluded") {
  return { assessedAt, basis: "合成证据已逐项核验", disposition, sourceId };
}

function jsonRequest(body: unknown, method = "POST") {
  return { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method };
}

test("keeps platform recommendations independent and exposes searchable, time-stamped progress", async () => {
  const { repository, boss, yupao } = setup();
  await using serviceScope = createScope();
  const app = createWorkspaceServiceHttpApp({ repository, serviceScope });
  try {
    const response = await app.request(
      "/api/reports",
      jsonRequest({
        ...command,
        entries: [reportEntry(boss.id, "recommended"), reportEntry(yupao.id, "pending")],
        targets: [
          { count: 2, platformId: "boss" },
          { count: 1, nextStep: "核对合成详情", platformId: "yupao" },
        ],
      }),
    );
    expect(response.status).toBe(created);
    const report = ResearchReport.assert(await response.json());
    expect(report.progress).toEqual([
      { count: 2, excluded: 0, pending: 0, platformId: "boss", recommended: 1, remaining: 1 },
      {
        count: 1,
        excluded: 0,
        nextStep: "核对合成详情",
        pending: 1,
        platformId: "yupao",
        recommended: 0,
        remaining: 1,
      },
    ]);
    expect(report.entries[firstIndex]).toEqual(reportEntry(boss.id, "recommended"));
    const unrelated = await app.request(
      `/api/reports?sourceId=${String(yupao.id)}&disposition=recommended`,
    );
    expect(ResearchReportList.assert(await unrelated.json()).reports).toEqual([]);
    const matched = await app.request(
      `/api/reports?sourceId=${String(boss.id)}&disposition=recommended`,
    );
    expect(ResearchReportList.assert(await matched.json()).reports.map(({ id }) => id)).toEqual([
      report.id,
    ]);
    const mcp = await app.request("/mcp", {
      ...jsonRequest({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: { disposition: "recommended", sourceId: boss.id },
          name: "list_research_reports",
        },
      }),
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
    });
    expect(await mcp.json()).toMatchObject({
      result: { structuredContent: { reports: [{ id: report.id, progress: report.progress }] } },
    });
    const replacement = await app.request(
      `/api/reports/${String(report.id)}`,
      jsonRequest(
        {
          ...command,
          entries: [reportEntry(yupao.id, "excluded")],
          targets: [{ count: 1, platformId: "yupao" }],
        },
        "PUT",
      ),
    );
    expect(replacement.status).toBe(ok);
    expect(ResearchReport.assert(await replacement.json()).progress).toEqual([
      { count: 1, excluded: 1, pending: 0, platformId: "yupao", recommended: 0, remaining: 1 },
    ]);
    expect(repository.listResearchReports({ sourceId: boss.id })).toEqual([]);
    const removed = await app.request(
      `/api/reports/${String(report.id)}`,
      jsonRequest({ initiatedBy: "agent", reason: "合成清理" }, "DELETE"),
    );
    expect(removed.status).toBe(ok);
    expect(repository.listResearchReports({ includeExpired: true, sourceId: yupao.id })).toEqual(
      [],
    );
  } finally {
    repository.close();
  }
});

test("rejects duplicate judgments, missing sources and invalid targets without changing the report", async () => {
  const { repository, boss } = setup();
  await using serviceScope = createScope();
  const app = createWorkspaceServiceHttpApp({ repository, serviceScope });
  try {
    const original = repository.saveResearchReport({
      ...command,
      entries: [reportEntry(boss.id, "recommended")],
    });
    if (!original) {
      throw new Error("合成报告未保存");
    }
    for (const patch of [
      { entries: [reportEntry(boss.id, "recommended"), reportEntry(boss.id, "excluded")] },
      { entries: [reportEntry(missingSourceId, "recommended")] },
      { entries: [{ ...reportEntry(boss.id, "recommended"), assessedAt: "invalid" }] },
      {
        targets: [
          { count: 1, platformId: "boss" },
          { count: 2, platformId: "boss" },
        ],
      },
      { targets: [{ count: 0, platformId: "boss" }] },
    ]) {
      // eslint-disable-next-line no-await-in-loop -- Each rejected replacement must leave the same stored report intact before the next attempt.
      const rejected = await app.request(
        `/api/reports/${String(original.id)}`,
        jsonRequest({ ...command, ...patch }, "PUT"),
      );
      expect(rejected.status).toBe(badRequest);
      expect(repository.readResearchReport(original.id)).toEqual(original);
    }
    for (const query of ["sourceId=0", "disposition=mentioned", "includeExpired=maybe"]) {
      // eslint-disable-next-line no-await-in-loop -- Exercise each public query rejection independently.
      const response = await app.request(`/api/reports?${query}`);
      expect(response.status).toBe(badRequest);
    }
  } finally {
    repository.close();
  }
});

test("retains expired recommendation evidence for explicit history checks without parsing Markdown", async () => {
  const { repository, boss } = setup();
  await using serviceScope = createScope();
  const app = createWorkspaceServiceHttpApp({ repository, serviceScope });
  try {
    repository.saveResearchReport({ ...command, markdown: `仅提及来源 ${String(boss.id)}` });
    const expired = repository.saveResearchReport({
      ...command,
      entries: [reportEntry(boss.id, "recommended")],
      expiresAt: "2000-01-01T00:00:00.000Z",
    });
    if (!expired) {
      throw new Error("合成报告未保存");
    }
    expect(
      repository.listResearchReports({ disposition: "recommended", sourceId: boss.id }),
    ).toEqual([]);
    const history = await app.request(
      `/api/reports?includeExpired=true&sourceId=${String(boss.id)}&disposition=recommended`,
    );
    expect(ResearchReportList.assert(await history.json()).reports.map(({ id }) => id)).toEqual([
      expired.id,
    ]);
    const hidden = await app.request(`/api/reports/${String(expired.id)}`);
    expect(hidden.status).toBe(missing);
    const detail = await app.request(`/api/reports/${String(expired.id)}?includeExpired=true`);
    expect(ResearchReport.assert(await detail.json()).entries).toEqual([
      reportEntry(boss.id, "recommended"),
    ]);
  } finally {
    repository.close();
  }
});
