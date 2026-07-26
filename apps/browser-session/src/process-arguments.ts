import path from "node:path";

import type { BrowserSessionProcessOptions } from "./runtime.js";

const maximumPort = 65_535;
const minimumPort = 1;

function readArgument(arguments_: readonly string[], name: string): string | null {
  const prefix = `--${name}=`;
  return arguments_.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function readAbsolutePath(arguments_: readonly string[], name: string): string | null {
  const value = readArgument(arguments_, name);
  if (!value) {
    return null;
  }
  if (!path.isAbsolute(value)) {
    throw new Error(`--${name} must be an absolute path.`);
  }
  return path.normalize(value);
}

function readPort(arguments_: readonly string[]): number | null {
  const value = readArgument(arguments_, "port");
  if (!value) {
    return null;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < minimumPort || port > maximumPort) {
    throw new Error("--port must be a valid TCP port.");
  }
  return port;
}

function readWorkspaceServiceUrl(arguments_: readonly string[]): URL | null {
  const value = readArgument(arguments_, "workspace-service-url");
  if (!value) {
    return null;
  }
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("--workspace-service-url must be a credentialless HTTP(S) URL.");
  }
  return url;
}

export function parseBrowserSessionArguments(
  arguments_: readonly string[],
): BrowserSessionProcessOptions {
  const browserExecutablePath = readAbsolutePath(arguments_, "browser-executable-path");
  const profilePath = readAbsolutePath(arguments_, "browser-profile-path");
  const hostname = readArgument(arguments_, "hostname");
  const port = readPort(arguments_);
  const workspaceServiceUrl = readWorkspaceServiceUrl(arguments_);
  if ((hostname && port === null) || (!hostname && port !== null)) {
    throw new Error("--hostname and --port must be provided together.");
  }
  return {
    ...(browserExecutablePath ? { browserExecutablePath } : {}),
    ...(profilePath ? { profilePath } : {}),
    ...(hostname && port !== null ? { httpServerAddress: { hostname, port } } : {}),
    ...(workspaceServiceUrl ? { workspaceServiceUrl } : {}),
  };
}
