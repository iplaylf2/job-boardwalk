import type { WorkspaceOverview } from "@job-boardwalk/contracts";

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

export function saveTargetLocation(input: {
  city: string;
  priority: number;
  requirement: "preferred" | "required";
}): Promise<void> {
  return requestWorkspaceChange("/api/search-intent/locations", {
    body: JSON.stringify({
      ...input,
      initiatedBy: "user",
      reason: "用户在 Dashboard 中编辑目标城市",
    }),
    method: "POST",
  });
}

export function deleteTargetLocation(id: number): Promise<void> {
  return requestWorkspaceChange(`/api/search-intent/locations/${id}`, {
    body: JSON.stringify({
      initiatedBy: "user",
      reason: "用户在 Dashboard 中删除目标城市",
    }),
    method: "DELETE",
  });
}
