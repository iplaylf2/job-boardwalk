import process from "node:process";

import { checkBrowserCommand } from "./cli/browser-check.js";
import { openPlatform } from "./cli/open.js";
import { writeError, writeJsonLine } from "./cli/output.js";
import { login } from "./login/workflow.js";
import { isPlatformName } from "./platforms.js";

const nodeRuntimeArgumentCount = 2;
const failedExitCode = 1;

async function main(): Promise<void> {
  const [command, platformArgument] = process.argv.slice(nodeRuntimeArgumentCount);
  if (command === "doctor") {
    checkBrowserCommand();
    return;
  }

  if (command !== "login" && command !== "open") {
    throw new Error(
      [
        "用法：",
        "  pnpm --filter @job-boardwalk/browser cli doctor",
        "  pnpm --filter @job-boardwalk/browser cli <login|open> <boss|yupao>",
      ].join("\n"),
    );
  }

  if (platformArgument === undefined || !isPlatformName(platformArgument)) {
    throw new Error("login 和 open 需要平台参数：boss 或 yupao");
  }

  await (command === "login"
    ? login(platformArgument, writeJsonLine)
    : openPlatform(platformArgument));
}

try {
  await main();
} catch (error) {
  writeError(error instanceof Error ? error.message : String(error));
  process.exitCode = failedExitCode;
}
