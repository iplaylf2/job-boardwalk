import path from "node:path";

import type { WorkspaceServiceOptions } from "#/runtime/service-lifecycle.js";

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

export function parseWorkspaceServiceArguments(
  arguments_: readonly string[],
): WorkspaceServiceOptions {
  const databasePath = readAbsolutePath(arguments_, "workspace-database-path");
  const migrationsDirectory = readAbsolutePath(arguments_, "migrations-directory");
  const hostname = readArgument(arguments_, "hostname");
  const port = readPort(arguments_);
  if ((hostname && port === null) || (!hostname && port !== null)) {
    throw new Error("--hostname and --port must be provided together.");
  }
  return {
    ...(databasePath ? { databasePath } : {}),
    ...(hostname && port !== null ? { httpServerAddress: { hostname, port } } : {}),
    ...(migrationsDirectory ? { migrationsDirectory } : {}),
  };
}
