import process from "node:process";

const defaultHostname = "127.0.0.1";
const defaultPort = 54_310;
const maximumPort = 65_535;
const minimumPort = 1;

export interface HttpServerAddress {
  hostname: string;
  port: number;
}

function resolveHostname(environment: NodeJS.ProcessEnv): string {
  const configuredHostname = environment["JOB_BOARDWALK_WORKSPACE_SERVICE_HOST"]?.trim();
  return configuredHostname || defaultHostname;
}

function resolvePort(environment: NodeJS.ProcessEnv): number {
  const configuredPort = environment["JOB_BOARDWALK_WORKSPACE_SERVICE_PORT"]?.trim();
  if (!configuredPort) {
    return defaultPort;
  }
  const port = Number(configuredPort);
  if (!Number.isInteger(port) || port < minimumPort || port > maximumPort) {
    throw new Error("JOB_BOARDWALK_WORKSPACE_SERVICE_PORT 必须是有效端口号");
  }
  return port;
}

export function resolveHttpServerAddress(
  environment: NodeJS.ProcessEnv = process.env,
): HttpServerAddress {
  return {
    hostname: resolveHostname(environment),
    port: resolvePort(environment),
  };
}
