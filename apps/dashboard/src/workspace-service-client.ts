import {
  JobPostingPage,
  ResearchReport,
  ResearchReportList,
  WorkspaceOverview,
} from "@job-boardwalk/contracts";
import type { JobEngagementKind, RecommendationPageReference } from "@job-boardwalk/contracts";

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

async function fetchWorkspaceResponse(path: string, failureMessage: string): Promise<Response> {
  try {
    return await fetch(path);
  } catch (error) {
    throw new WorkspaceReadError(failureMessage, { cause: error });
  }
}

async function readWorkspaceData<Result>(input: {
  failureMessage: string;
  notFoundMessage?: string;
  parse: (value: unknown) => Result;
  path: string;
}): Promise<Result> {
  const response = await fetchWorkspaceResponse(input.path, input.failureMessage);
  if (!response.ok) {
    if (response.status === notFoundStatus && typeof input.notFoundMessage === "string") {
      throw new WorkspaceReadError(input.notFoundMessage, { retryable: false });
    }
    throw new WorkspaceReadError(input.failureMessage);
  }
  try {
    return input.parse(await response.json());
  } catch (error) {
    throw new WorkspaceReadError(input.failureMessage, { cause: error });
  }
}

async function requestWorkspaceChange(path: string, init: RequestInit): Promise<void> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json" },
  });
  if (response.ok) {
    return;
  }
  const result = (await response.json().catch(() => null)) as { error?: unknown } | null;
  throw new Error(typeof result?.error === "string" ? result.error : "无法保存更改，请稍后再试。");
}

export function readWorkspaceOverview(): Promise<WorkspaceOverview> {
  return readWorkspaceData({
    failureMessage: "无法读取本机工作区。请确认工作区服务正在运行。",
    parse: WorkspaceOverview.assert,
    path: "/api/workspace/overview",
  });
}

export function readJobPostingPage(input: {
  engagement?: JobEngagementKind;
  page: number;
  pageSize: number;
  platform?: string;
  query?: string;
}): Promise<JobPostingPage> {
  const search = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
    ...(input.engagement ? { engagement: input.engagement } : {}),
    ...(input.platform ? { platform: input.platform } : {}),
    ...(input.query ? { query: input.query } : {}),
  });
  return readWorkspaceData({
    failureMessage: "无法读取岗位库。请确认工作区服务正在运行。",
    parse: JobPostingPage.assert,
    path: `/api/jobs?${search.toString()}`,
  });
}

export function listResearchReports(): Promise<ResearchReportList> {
  return readWorkspaceData({
    failureMessage: "无法读取研究报告。请确认工作区服务正在运行。",
    parse: ResearchReportList.assert,
    path: "/api/reports",
  });
}

export function readResearchReport(id: number): Promise<ResearchReport> {
  return readWorkspaceData({
    failureMessage: "无法读取研究报告。请确认工作区服务正在运行。",
    notFoundMessage: "这份研究报告不存在或已经过期。",
    parse: ResearchReport.assert,
    path: `/api/reports/${String(id)}`,
  });
}

export function saveProfileFact(input: { id?: number; key: string; value: string }): Promise<void> {
  return requestWorkspaceChange(
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

export function deleteProfileFact(id: number): Promise<void> {
  return requestWorkspaceChange(`/api/profile/facts/${id}`, {
    body: JSON.stringify({
      initiatedBy: "user",
      reason: "用户在 Dashboard 中移除个人条件",
    }),
    method: "DELETE",
  });
}

export function saveJobSearchIntent(input: {
  city: string;
  id?: number;
  name: string;
  position: string;
  selected: boolean;
  recommendationPages: RecommendationPageReference[];
}): Promise<void> {
  const { id, ...intent } = input;
  return requestWorkspaceChange(id ? `/api/search-intents/${id}` : "/api/search-intents", {
    body: JSON.stringify({
      ...intent,
      initiatedBy: "user",
      reason: "用户在 Dashboard 中维护求职方向",
    }),
    method: id ? "PUT" : "POST",
  });
}

export function selectJobSearchIntent(id: number): Promise<void> {
  return requestWorkspaceChange(`/api/search-intents/${id}/select`, {
    body: JSON.stringify({
      initiatedBy: "user",
      reason: "用户在 Dashboard 中将求职方向设为当前",
    }),
    method: "POST",
  });
}

export function deleteJobSearchIntent(id: number): Promise<void> {
  return requestWorkspaceChange(`/api/search-intents/${id}`, {
    body: JSON.stringify({
      initiatedBy: "user",
      reason: "用户在 Dashboard 中移除求职方向",
    }),
    method: "DELETE",
  });
}
