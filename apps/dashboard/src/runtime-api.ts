import type {
  OpenPlatformBrowserResult,
  PlatformAccessSummary,
  WorkspaceOverview,
} from "@job-boardwalk/contracts";

export async function readWorkspaceOverview(): Promise<WorkspaceOverview> {
  const response = await fetch("/api/workspace/overview");
  if (!response.ok) {
    throw new Error("无法读取本地工作区，请确认本地服务正在运行");
  }
  return (await response.json()) as WorkspaceOverview;
}

export async function openPlatformBrowser(platformAccess: PlatformAccessSummary): Promise<void> {
  const purpose = platformAccess.authentication === "unknown" ? "login" : "browse";
  const response = await fetch(
    `/api/platforms/${platformAccess.platformId}/browser/open?purpose=${purpose}`,
    { method: "POST" },
  );
  if (!response.ok) {
    throw new Error("无法打开招聘平台窗口，请确认本地服务和浏览器可用");
  }
  (await response.json()) as OpenPlatformBrowserResult;
}
