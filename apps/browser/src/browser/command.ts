import { spawnSync } from "node:child_process";
import process from "node:process";

const browserCandidates = ["chromium", "chromium-browser", "google-chrome", "chrome"];
const successfulExitCode = 0;

function isAvailable(command: string): boolean {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  return result.error === undefined && result.status === successfulExitCode;
}

export function resolveChromiumCommand(): string {
  const configuredCommand = process.env["JOB_BOARDWALK_BROWSER"];
  if (configuredCommand !== undefined) {
    return configuredCommand;
  }

  const detectedCommand = browserCandidates.find(isAvailable);
  if (detectedCommand === undefined) {
    throw new Error(
      "找不到 Chromium 浏览器；请安装兼容浏览器，或通过 JOB_BOARDWALK_BROWSER 指定命令或绝对路径",
    );
  }
  return detectedCommand;
}
