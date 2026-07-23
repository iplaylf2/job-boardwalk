import {
  JobPostingPage,
  ResearchReport,
  ResearchReportList,
  WorkspaceOverview,
} from "@job-boardwalk/contracts";
import type { JobEngagementKind, RecommendationPageReference } from "@job-boardwalk/contracts";
import { CanceledError, InterruptedError, ScopeError, abortSignal, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

const notFoundStatus = 404;

interface WorkspaceReadErrorOptions extends ErrorOptions {
  retryable?: boolean;
}

export class WorkspaceReadError extends Error {
  public override name = "WorkspaceReadError";
  public readonly retryable: boolean;

  public constructor(message: string, options: WorkspaceReadErrorOptions = {}) {
    super(message, options);
    this.retryable = options.retryable ?? true;
  }
}

function isRuntimeConvergence(error: unknown): boolean {
  return (
    error instanceof CanceledError ||
    error instanceof InterruptedError ||
    error instanceof ScopeError
  );
}

function* fetchWorkspaceResponse(path: string, init?: RequestInit): RiteCoroutine<Response> {
  const signal = yield* abortSignal();
  return yield* until(() => fetch(path, { ...init, signal }));
}

function* fetchWorkspaceReadResponse(
  path: string,
  failureMessage: string,
): RiteCoroutine<Response> {
  try {
    return yield* fetchWorkspaceResponse(path);
  } catch (error) {
    if (isRuntimeConvergence(error)) {
      throw error;
    }
    throw new WorkspaceReadError(failureMessage, { cause: error });
  }
}

function* fetchWorkspaceChangeResponse(path: string, init: RequestInit): RiteCoroutine<Response> {
  try {
    return yield* fetchWorkspaceResponse(path, {
      ...init,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    if (isRuntimeConvergence(error)) {
      throw error;
    }
    throw new Error("无法提交更改，请稍后再试。", { cause: error });
  }
}

function* readWorkspaceData<Result>(input: {
  failureMessage: string;
  notFoundMessage?: string;
  parse: (value: unknown) => Result;
  path: string;
}): RiteCoroutine<Result> {
  const response = yield* fetchWorkspaceReadResponse(input.path, input.failureMessage);
  if (!response.ok) {
    if (response.status === notFoundStatus && typeof input.notFoundMessage === "string") {
      throw new WorkspaceReadError(input.notFoundMessage, { retryable: false });
    }
    throw new WorkspaceReadError(input.failureMessage);
  }
  try {
    return input.parse(yield* until(() => response.json()));
  } catch (error) {
    if (isRuntimeConvergence(error)) {
      throw error;
    }
    throw new WorkspaceReadError(input.failureMessage, { cause: error });
  }
}

function* requestWorkspaceChange(path: string, init: RequestInit): RiteCoroutine<void> {
  const response = yield* fetchWorkspaceChangeResponse(path, init);
  if (response.ok) {
    return;
  }
  const result = (yield* until(() =>
    response.json().then(
      (value: unknown) => value as { error?: unknown },
      () => null,
    ),
  )) as { error?: unknown } | null;
  throw new Error(typeof result?.error === "string" ? result.error : "无法提交更改，请稍后再试。");
}

export function* readWorkspaceOverview(): RiteCoroutine<WorkspaceOverview> {
  return yield* readWorkspaceData({
    failureMessage: "无法读取本机工作区。请确认工作区服务正在运行。",
    parse: WorkspaceOverview.assert,
    path: "/api/workspace/overview",
  });
}

export function* readJobPostingPage(input: {
  engagement?: JobEngagementKind;
  page: number;
  pageSize: number;
  platform?: string;
  query?: string;
}): RiteCoroutine<JobPostingPage> {
  const search = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
    ...(input.engagement ? { engagement: input.engagement } : {}),
    ...(input.platform ? { platform: input.platform } : {}),
    ...(input.query ? { query: input.query } : {}),
  });
  return yield* readWorkspaceData({
    failureMessage: "无法读取岗位库。请确认工作区服务正在运行。",
    parse: JobPostingPage.assert,
    path: `/api/jobs?${search.toString()}`,
  });
}

export function* listResearchReports(): RiteCoroutine<ResearchReportList> {
  return yield* readWorkspaceData({
    failureMessage: "无法读取研究报告。请确认工作区服务正在运行。",
    parse: ResearchReportList.assert,
    path: "/api/reports",
  });
}

export function* readResearchReport(id: number): RiteCoroutine<ResearchReport> {
  return yield* readWorkspaceData({
    failureMessage: "无法读取研究报告。请确认工作区服务正在运行。",
    notFoundMessage: "这份研究报告不存在或已经过期。",
    parse: ResearchReport.assert,
    path: `/api/reports/${String(id)}`,
  });
}

export function* saveProfileFact(input: {
  id?: number;
  key: string;
  value: string;
}): RiteCoroutine<void> {
  yield* requestWorkspaceChange(
    typeof input.id === "number" ? `/api/profile/facts/${String(input.id)}` : "/api/profile/facts",
    {
      body: JSON.stringify({
        confirmed: true,
        initiatedBy: "user",
        key: input.key,
        reason: "用户在 Dashboard 中维护个人条件",
        source: "user",
        value: input.value,
      }),
      method: typeof input.id === "number" ? "PUT" : "POST",
    },
  );
}

export function* deleteProfileFact(id: number): RiteCoroutine<void> {
  yield* requestWorkspaceChange(`/api/profile/facts/${id}`, {
    body: JSON.stringify({
      initiatedBy: "user",
      reason: "用户在 Dashboard 中移除个人条件",
    }),
    method: "DELETE",
  });
}

export function* saveJobSearchIntent(input: {
  city: string;
  id?: number;
  name: string;
  position: string;
  selected: boolean;
  recommendationPages: RecommendationPageReference[];
}): RiteCoroutine<void> {
  const { id, ...intent } = input;
  yield* requestWorkspaceChange(id ? `/api/search-intents/${id}` : "/api/search-intents", {
    body: JSON.stringify({
      ...intent,
      initiatedBy: "user",
      reason: "用户在 Dashboard 中维护求职方向",
    }),
    method: id ? "PUT" : "POST",
  });
}

export function* selectJobSearchIntent(id: number): RiteCoroutine<void> {
  yield* requestWorkspaceChange(`/api/search-intents/${id}/select`, {
    body: JSON.stringify({
      initiatedBy: "user",
      reason: "用户在 Dashboard 中将求职方向设为当前",
    }),
    method: "POST",
  });
}

export function* deleteJobSearchIntent(id: number): RiteCoroutine<void> {
  yield* requestWorkspaceChange(`/api/search-intents/${id}`, {
    body: JSON.stringify({
      initiatedBy: "user",
      reason: "用户在 Dashboard 中移除求职方向",
    }),
    method: "DELETE",
  });
}
