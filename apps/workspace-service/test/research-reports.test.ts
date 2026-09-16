import path from "node:path";
import { createScope } from "@shajara/host";
import { ResearchReport, ResearchReportList } from "@job-boardwalk/contracts";
import type { SaveResearchReportCommand } from "@job-boardwalk/contracts";
import { expect, test } from "vitest";
import { createWorkspaceServiceHttpApp } from "#/http/app.js";
import { WorkspaceRepository } from "#/persistence/workspace-repository.js";

const ok = 200;
const badRequest = 400;
const missing = 404;
const command: SaveResearchReportCommand = {
  initiatedBy: "agent",
  markdown: "# 合成行业研究\n\n## 方法\n\n对比合成样本甲与乙。\n\n## 观察\n\n尚需补充访谈。\n",
  reason: "合成研究测试",
  state: "draft",
  title: "合成行业观察",
};

function setup() {
  return new WorkspaceRepository({
    databasePath: ":memory:",
    migrationsDirectory: path.resolve(import.meta.dirname, "../migrations"),
  });
}

function jsonRequest(body: unknown, method = "POST") {
  return { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method };
}

test("replaces a research document without job data and preserves authored Markdown", async () => {
  const repository = setup();
  await using serviceScope = createScope();
  const app = createWorkspaceServiceHttpApp({ repository, serviceScope });
  try {
    const original = repository.saveResearchReport(command);
    if (!original) {
      throw new Error("合成报告未保存");
    }
    expect(repository.listJobPostings()).toEqual([]);
    const replacement = {
      ...command,
      markdown: "# 合成学习计划\n\n- 研读资料\n- 验证假设\n",
      state: "complete",
      title: "合成学习计划",
    };
    const response = await app.request(
      `/api/reports/${String(original.id)}`,
      jsonRequest(replacement, "PUT"),
    );
    expect(response.status).toBe(ok);
    const report = ResearchReport.assert(await response.json());
    expect(report).toEqual({
      createdAt: original.createdAt,
      id: original.id,
      markdown: replacement.markdown,
      state: "complete",
      title: replacement.title,
      updatedAt: expect.any(String),
    });
    expect(repository.readResearchReport(original.id)).toEqual(report);
    const removed = await app.request(
      `/api/reports/${String(original.id)}`,
      jsonRequest({ initiatedBy: "user", reason: "合成清理" }, "DELETE"),
    );
    expect(removed.status).toBe(ok);
    expect(repository.listResearchReports({ includeExpired: true })).toEqual([]);
  } finally {
    repository.close();
  }
});

test.each([
  { title: " " },
  { markdown: "\n\t" },
  { state: "unknown" },
  { expiresAt: "not-a-time" },
])("rejects invalid report replacement without losing saved content: %j", async (patch) => {
  const repository = setup();
  await using serviceScope = createScope();
  const app = createWorkspaceServiceHttpApp({ repository, serviceScope });
  try {
    const original = repository.saveResearchReport(command);
    if (!original) {
      throw new Error("合成报告未保存");
    }
    const response = await app.request(
      `/api/reports/${String(original.id)}`,
      jsonRequest({ ...command, ...patch }, "PUT"),
    );
    expect(response.status).toBe(badRequest);
    expect(await response.json()).toMatchObject({ error: { code: "invalid-input" } });
    expect(repository.readResearchReport(original.id)).toEqual(original);
  } finally {
    repository.close();
  }
});

test("reads expired documents explicitly through HTTP and MCP", async () => {
  const repository = setup();
  await using serviceScope = createScope();
  const app = createWorkspaceServiceHttpApp({ repository, serviceScope });
  try {
    const expired = repository.saveResearchReport({
      ...command,
      expiresAt: "2000-01-01T00:00:00.000Z",
    });
    if (!expired) {
      throw new Error("合成报告未保存");
    }
    const hiddenList = await app.request("/api/reports");
    expect(ResearchReportList.assert(await hiddenList.json()).reports).toEqual([]);
    const hidden = await app.request(`/api/reports/${String(expired.id)}`);
    expect(hidden.status).toBe(missing);
    const list = await app.request("/api/reports?includeExpired=true");
    const { markdown: _markdown, ...summary } = expired;
    expect(ResearchReportList.assert(await list.json()).reports).toEqual([summary]);
    const detail = await app.request(`/api/reports/${String(expired.id)}?includeExpired=true`);
    expect(ResearchReport.assert(await detail.json())).toEqual(expired);
    const invalidQuery = await app.request("/api/reports?includeExpired=maybe");
    expect(invalidQuery.status).toBe(badRequest);
    const mcp = await app.request("/mcp", {
      ...jsonRequest({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: { id: expired.id, includeExpired: true },
          name: "read_research_report",
        },
      }),
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
    });
    expect(await mcp.json()).toMatchObject({ result: { structuredContent: expired } });
  } finally {
    repository.close();
  }
});
