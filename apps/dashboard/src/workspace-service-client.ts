import {
  JobPostingPage,
  ResearchReport,
  ResearchReportList,
  WorkspaceOverview,
} from "@job-boardwalk/contracts";
import type { RecommendationPageReference } from "@job-boardwalk/contracts";

const notFoundStatus = 404;

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

export async function readWorkspaceOverview(): Promise<WorkspaceOverview> {
  const response = await fetch("/api/workspace/overview");
  if (!response.ok) {
    throw new Error("无法读取本机工作区。请确认工作区服务已经启动。");
  }
  return WorkspaceOverview.assert(await response.json());
}

export async function readJobPostingPage(input: {
  interestedOnly?: boolean;
  page: number;
  pageSize: number;
  platform?: string;
  query?: string;
}): Promise<JobPostingPage> {
  const search = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
    ...(input.interestedOnly ? { interested: "true" } : {}),
    ...(input.platform ? { platform: input.platform } : {}),
    ...(input.query ? { query: input.query } : {}),
  });
  const response = await fetch(`/api/jobs?${search.toString()}`);
  if (!response.ok) {
    throw new Error("无法读取岗位库。请确认工作区服务已经启动。");
  }
  return JobPostingPage.assert(await response.json());
}

export async function listResearchReports(): Promise<ResearchReportList> {
  const response = await fetch("/api/reports");
  if (!response.ok) {
    throw new Error("无法读取研究报告。请确认工作区服务已经启动。");
  }
  return ResearchReportList.assert(await response.json());
}

export async function readResearchReport(id: number): Promise<ResearchReport> {
  const response = await fetch(`/api/reports/${String(id)}`);
  if (!response.ok) {
    throw new Error(
      response.status === notFoundStatus
        ? "这份研究报告不存在或已经过期。"
        : "无法读取研究报告。请确认工作区服务已经启动。",
    );
  }
  return ResearchReport.assert(await response.json());
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
