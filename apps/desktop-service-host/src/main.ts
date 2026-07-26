import { createRequire } from "node:module";
import process from "node:process";

import { discoverSystemBrowser } from "#/system-browser-discovery.js";

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

async function prepareBrowserSession(): Promise<void> {
  const systemBrowser = await discoverSystemBrowser();
  if (systemBrowser.state !== "recognized") {
    throw new Error(systemBrowser.detail);
  }
  process.argv.push(`--browser-executable-path=${systemBrowser.executablePath}`);
}

async function main(): Promise<void> {
  const userArguments = process.argv.slice(userArgumentStartIndex);
  const role = parseDesktopServiceRole(userArguments);
  if (role === "browser-session") {
    await prepareBrowserSession();
  }
  createRequire(process.execPath)(readRequiredArgument(userArguments, "module"));
}

// oxlint-disable-next-line unicorn/prefer-top-level-await -- Node SEA embeds a CommonJS entry script.
main().catch((error: unknown) => {
  process.stderr.write(`[Desktop Service Host] ${String(error)}\n`);
  process.exitCode = 1;
});
