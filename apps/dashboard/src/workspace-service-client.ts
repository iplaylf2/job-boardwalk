import type { WorkspaceOverview } from "@job-boardwalk/contracts";

export async function readWorkspaceOverview(): Promise<WorkspaceOverview> {
  const response = await fetch("/api/workspace/overview");
  if (!response.ok) {
    throw new Error("无法读取本机工作区。请确认 Workspace Service 正在运行。");
  }
  return (await response.json()) as WorkspaceOverview;
}
