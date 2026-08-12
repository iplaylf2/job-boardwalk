import process from "node:process";

import { runServiceRole } from "#/service-role.js";

const userArgumentStartIndex = 2;

type DesktopServiceRole = "browser-session" | "workspace-service";

function parseDesktopServiceRole(arguments_: readonly string[]): DesktopServiceRole {
  const roleArgument = arguments_.find((argument) => argument.startsWith("--role="));
  const role = roleArgument?.slice("--role=".length);
  if (role === "browser-session" || role === "workspace-service") {
    return role;
  }
  throw new Error(`Unknown or missing desktop service role: ${role ?? "(missing)"}`);
}

function readRequiredArgument(arguments_: readonly string[], name: string): string {
  const prefix = `--${name}=`;
  const value = arguments_.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (!value) {
    throw new Error(`--${name} is required.`);
  }
  return value;
}

function main(): Promise<void> {
  const userArguments = process.argv.slice(userArgumentStartIndex);
  parseDesktopServiceRole(userArguments);
  const serviceEntrypoint = readRequiredArgument(userArguments, "service-entrypoint");
  return runServiceRole(serviceEntrypoint);
}

try {
  // oxlint-disable-next-line unicorn/prefer-top-level-await -- SEA executes this bundled CommonJS entrypoint.
  main().catch(() => {
    process.exitCode = 1;
  });
} catch (error) {
  process.stderr.write(`[Desktop Service Host] ${String(error)}\n`);
  process.exitCode = 1;
}
