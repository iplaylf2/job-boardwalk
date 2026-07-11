import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { readFile, rm } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

import { resolveChromiumCommand } from "./command.js";

const initialDebuggingPortAttempt = 0;
const debuggingPortAttemptLimit = 100;
const debuggingPortPollingMilliseconds = 100;
const nextAttemptIncrement = 1;
const browserStopGraceMilliseconds = 3e3;

export interface BrowserSession {
  browserProcess: ChildProcess;
  debuggingPort?: string;
  profilePath: string;
}

export function hasBrowserProcessExited(process: ChildProcess): boolean {
  return process.exitCode !== null || process.signalCode !== null;
}

async function readDebuggingPort(
  profilePath: string,
  process: ChildProcess,
  attempt = initialDebuggingPortAttempt,
): Promise<string> {
  if (hasBrowserProcessExited(process)) {
    throw new Error("Chromium 在开放本地控制连接前退出");
  }
  if (attempt >= debuggingPortAttemptLimit) {
    throw new Error("Chromium 未在预期时间内开放本地控制连接");
  }
  try {
    const contents = await readFile(`${profilePath}/DevToolsActivePort`, "utf8");
    const [port = ""] = contents.split("\n");
    return port;
  } catch {
    await setTimeout(debuggingPortPollingMilliseconds);
    return readDebuggingPort(profilePath, process, attempt + nextAttemptIncrement);
  }
}

export async function startBrowserSession(
  profilePath: string,
  targetUrl: string,
  controlMode: "cdp" | "none",
): Promise<BrowserSession> {
  const launchArguments = [
    `--user-data-dir=${profilePath}`,
    "--no-first-run",
    "--no-default-browser-check",
  ];
  if (controlMode === "cdp") {
    await rm(`${profilePath}/DevToolsActivePort`, { force: true });
    launchArguments.push("--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0");
  }
  launchArguments.push(targetUrl);
  const browserProcess = spawn(resolveChromiumCommand(), launchArguments, { stdio: "ignore" });
  await once(browserProcess, "spawn");
  const session = { browserProcess, profilePath };
  try {
    const debuggingPort =
      controlMode === "cdp" ? await readDebuggingPort(profilePath, browserProcess) : undefined;
    return debuggingPort === undefined ? session : { ...session, debuggingPort };
  } catch (error) {
    await stopBrowserSession(session).catch(() => null);
    throw error;
  }
}

export async function stopBrowserSession(session: BrowserSession): Promise<void> {
  if (hasBrowserProcessExited(session.browserProcess)) {
    return;
  }
  session.browserProcess.kill("SIGTERM");
  const exited = await Promise.race([
    once(session.browserProcess, "exit").then(() => true),
    setTimeout(browserStopGraceMilliseconds, false),
  ]);
  if (!exited && !hasBrowserProcessExited(session.browserProcess)) {
    const forcedExit = once(session.browserProcess, "exit");
    session.browserProcess.kill("SIGKILL");
    await forcedExit;
    throw new Error("Chromium 未能在宽限期内正常退出");
  }
}
