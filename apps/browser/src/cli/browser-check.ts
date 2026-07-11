import { spawnSync } from "node:child_process";

import { resolveChromiumCommand } from "#/browser/command.js";
import { writeLine } from "./output.js";

const successfulExitCode = 0;

export function checkBrowserCommand(): void {
  const browserCommand = resolveChromiumCommand();
  const browser = spawnSync(browserCommand, ["--version"], { encoding: "utf8" });
  if (browser.error !== undefined || browser.status !== successfulExitCode) {
    throw new Error(`找不到可用的 Chromium 命令：${browserCommand}`);
  }

  writeLine(`浏览器：${browser.stdout.trim()}`);
  writeLine("浏览器命令检查通过。");
}
