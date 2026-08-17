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
  WorkspaceReadError,
} from "#/workspace-service-client.js";

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

async function readFailure(result: Promise<unknown>): Promise<WorkspaceReadError> {
  try {
    await result;
  } catch (error) {
    expect(error).toBeInstanceOf(WorkspaceReadError);
    return error as WorkspaceReadError;
  }
  throw new Error("Expected the workspace read to fail");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("classifies an unreachable Workspace Service as a readable failure", async () => {
  const cause = new TypeError("synthetic fetch failure");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cause));

  const error = await readFailure(execute(listResearchReports()));
  expect(error.retryable).toBe(true);
  expect(error.cause).toBe(cause);
});

test("preserves the cause of an unreachable Workspace Service mutation", async () => {
  const cause = new TypeError("synthetic fetch failure");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cause));

  await expect(
    execute(saveProfileFact({ key: "Synthetic preference", value: "Synthetic value" })),
  ).rejects.toMatchObject({
    cause,
  });
});

test("classifies an unsuccessful Workspace Service response as a readable failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: badGatewayStatus })),
  );

  const error = await readFailure(execute(readJobPostingPage({ page: 1, pageSize: 24 })));
  expect(error.retryable).toBe(true);
});

test("classifies a response outside the public contract as a service failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ reports: "not-a-list" })));

  const error = await readFailure(execute(listResearchReports()));
  expect(error.retryable).toBe(true);
});

test("preserves the distinct missing-report outcome", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

  const error = await readFailure(execute(readResearchReport(missingReportId)));
  expect(error.retryable).toBe(false);
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
