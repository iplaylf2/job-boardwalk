// @vitest-environment node

import { afterEach, expect, test, vi } from "vitest";

import {
  listResearchReports,
  readJobPostingPage,
  readResearchReport,
} from "#/workspace-service-client.js";
import type { WorkspaceReadError } from "#/workspace-service-client.js";

const badGatewayStatus = 502;
const missingReportId = 71;

afterEach(() => {
  vi.unstubAllGlobals();
});

test("classifies an unreachable Workspace Service as a readable failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

  await expect(listResearchReports()).rejects.toMatchObject({
    message: "无法读取研究报告。请确认工作区服务正在运行。",
    retryable: true,
  } satisfies Partial<WorkspaceReadError>);
});

test("classifies an unsuccessful Workspace Service response as a readable failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: badGatewayStatus })),
  );

  await expect(readJobPostingPage({ page: 1, pageSize: 24 })).rejects.toThrow(
    "无法读取岗位库。请确认工作区服务正在运行。",
  );
});

test("classifies a response outside the public contract as a service failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ reports: "not-a-list" })));

  await expect(listResearchReports()).rejects.toThrow(
    "无法读取研究报告。请确认工作区服务正在运行。",
  );
});

test("preserves the distinct missing-report outcome", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

  await expect(readResearchReport(missingReportId)).rejects.toMatchObject({
    message: "这份研究报告不存在或已经过期。",
    retryable: false,
  } satisfies Partial<WorkspaceReadError>);
});
