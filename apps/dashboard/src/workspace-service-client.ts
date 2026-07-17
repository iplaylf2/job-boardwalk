import type { JobSearchIntentSource, WorkspaceOverview } from "@job-boardwalk/contracts";

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
  return (await response.json()) as WorkspaceOverview;
}

export function saveProfileFact(input: { key: string; value: string }): Promise<void> {
  return requestWorkspaceChange("/api/profile/facts", {
    body: JSON.stringify({
      confirmed: true,
      initiatedBy: "user",
      key: input.key,
      reason: "用户在 Dashboard 中编辑个人情况",
      source: "user",
      value: input.value,
    }),
    method: "POST",
  });
}

export function deleteProfileFact(id: number): Promise<void> {
  return requestWorkspaceChange(`/api/profile/facts/${id}`, {
    body: JSON.stringify({
      initiatedBy: "user",
      reason: "用户在 Dashboard 中删除个人情况",
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
  sources: JobSearchIntentSource[];
}): Promise<void> {
  return requestWorkspaceChange(
    input.id ? `/api/search-intents/${input.id}` : "/api/search-intents",
    {
      body: JSON.stringify({
        ...input,
        initiatedBy: "user",
        reason: "用户在 Dashboard 中编辑求职倾向",
      }),
      method: input.id ? "PUT" : "POST",
    },
  );
}

export function selectJobSearchIntent(id: number): Promise<void> {
  return requestWorkspaceChange(`/api/search-intents/${id}/select`, {
    body: JSON.stringify({
      initiatedBy: "user",
      reason: "用户在 Dashboard 中选中当前求职倾向",
    }),
    method: "POST",
  });
}

export function deleteJobSearchIntent(id: number): Promise<void> {
  return requestWorkspaceChange(`/api/search-intents/${id}`, {
    body: JSON.stringify({
      initiatedBy: "user",
      reason: "用户在 Dashboard 中删除求职倾向",
    }),
    method: "DELETE",
  });
}
