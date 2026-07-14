import process from "node:process";

import { getProxyForUrl } from "proxy-from-env";

export interface CdpConnectionOptions {
  endpoint: URL;
  proxy: URL | null;
}

function parseUrl(value: string, variableName: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${variableName} 必须是有效 URL。`);
  }
}

export function resolveCdpConnectionOptions(
  environment: NodeJS.ProcessEnv = process.env,
  proxyForUrl: (url: string) => string = getProxyForUrl,
): CdpConnectionOptions {
  const configuredEndpoint = environment["JOB_BOARDWALK_CDP_URL"]?.trim();
  if (!configuredEndpoint) {
    throw new Error("请设置 JOB_BOARDWALK_CDP_URL，使其指向宿主机的 CDP HTTP 端点。");
  }
  const endpoint = parseUrl(configuredEndpoint, "JOB_BOARDWALK_CDP_URL");
  const hasExplicitProxy = "JOB_BOARDWALK_CDP_PROXY_URL" in environment;
  const explicitProxy = environment["JOB_BOARDWALK_CDP_PROXY_URL"] ?? "";
  const proxyValue = hasExplicitProxy
    ? explicitProxy.trim()
    : proxyForUrl(endpoint.toString()).trim();
  return {
    endpoint,
    proxy: proxyValue ? parseUrl(proxyValue, "JOB_BOARDWALK_CDP_PROXY_URL") : null,
  };
}
