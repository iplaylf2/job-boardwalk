import process from "node:process";

const defaultWorkspaceServiceUrl = "http://127.0.0.1:54310";

export function resolveWorkspaceServiceUrl(environment: NodeJS.ProcessEnv = process.env): URL {
  const configuredUrl = environment["JOB_BOARDWALK_WORKSPACE_SERVICE_URL"]?.trim();
  const url = new URL(configuredUrl || defaultWorkspaceServiceUrl);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("JOB_BOARDWALK_WORKSPACE_SERVICE_URL 必须是无凭据的 HTTP(S) URL");
  }
  return url;
}
