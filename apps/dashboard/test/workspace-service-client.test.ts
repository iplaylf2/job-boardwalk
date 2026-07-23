// @vitest-environment node

import { CanceledError } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { afterEach, expect, test, vi } from "vitest";

import { createDashboardRuntime } from "#/dashboard-runtime.js";
import {
  listResearchReports,
  readJobPostingPage,
  readResearchReport,
  saveProfileFact,
} from "#/workspace-service-client.js";
import type { WorkspaceReadError } from "#/workspace-service-client.js";

const badGatewayStatus = 502;
const missingReportId = 71;

async function execute<Return>(routine: RiteCoroutine<Return>): Promise<Return> {
  const runtime = createDashboardRuntime();
  try {
    return await runtime.run(routine);
  } finally {
    await runtime.close();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("classifies an unreachable Workspace Service as a readable failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

  await expect(execute(listResearchReports())).rejects.toMatchObject({
    message: "无法读取研究报告。请确认工作区服务正在运行。",
    retryable: true,
  } satisfies Partial<WorkspaceReadError>);
});

test("classifies an unreachable Workspace Service mutation as a save failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

  await expect(
    execute(saveProfileFact({ key: "Synthetic preference", value: "Synthetic value" })),
  ).rejects.toMatchObject({
    message: "无法提交更改，请稍后再试。",
    name: "Error",
  });
});

test("classifies an unsuccessful Workspace Service response as a readable failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: badGatewayStatus })),
  );

  await expect(execute(readJobPostingPage({ page: 1, pageSize: 24 }))).rejects.toThrow(
    "无法读取岗位库。请确认工作区服务正在运行。",
  );
});

test("classifies a response outside the public contract as a service failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ reports: "not-a-list" })));

  await expect(execute(listResearchReports())).rejects.toThrow(
    "无法读取研究报告。请确认工作区服务正在运行。",
  );
});

test("preserves the distinct missing-report outcome", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

  await expect(execute(readResearchReport(missingReportId))).rejects.toMatchObject({
    message: "这份研究报告不存在或已经过期。",
    retryable: false,
  } satisfies Partial<WorkspaceReadError>);
});

test("aborts the Workspace Service fetch when its UI routine is canceled", async () => {
  const fetchStarted = Promise.withResolvers<AbortSignal>();
  vi.stubGlobal(
    "fetch",
    vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      if (!signal) {
        return Promise.reject(new Error("expected a request abort signal"));
      }
      fetchStarted.resolve(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    }),
  );
  const runtime = createDashboardRuntime();
  const controller = new AbortController();
  try {
    const result = runtime.run(listResearchReports(), { signal: controller.signal });
    const fetchSignal = await fetchStarted.promise;
    controller.abort();

    await expect(result).rejects.toBeInstanceOf(CanceledError);
    expect(fetchSignal.aborted).toBe(true);
  } finally {
    await runtime.close();
  }
});
