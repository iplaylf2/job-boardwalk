import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { readFile, rm } from "node:fs/promises";

import { abortSignal, resource, sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { race, wait } from "@shajara/host/primitives";

import { resolveChromiumCommand } from "./command.js";

const debuggingPortAttemptLimit = 100;
const debuggingPortPollingMilliseconds = 100;
const debuggingPortTimeoutMilliseconds =
  debuggingPortAttemptLimit * debuggingPortPollingMilliseconds;
const browserStopGraceMilliseconds = 3e3;

export interface BrowserSession {
  browserProcess: ChildProcess;
  debuggingPort?: string;
  profilePath: string;
}

export function hasBrowserProcessExited(process: ChildProcess): boolean {
  return process.exitCode !== null || process.signalCode !== null;
}

function* readDebuggingPort(profilePath: string, process: ChildProcess): RiteCoroutine<string> {
  const outcome = yield* race([
    function* observeDebuggingPort() {
      while (true) {
        if (hasBrowserProcessExited(process)) {
          return {
            error: new Error("Chromium 在开放本地控制连接前退出"),
            kind: "failed",
          } as const;
        }
        const contents = yield* until(() =>
          readFile(`${profilePath}/DevToolsActivePort`, "utf8").then(
            (value) => value,
            () => null,
          ),
        );
        if (contents !== null) {
          const [port = ""] = contents.split("\n");
          if (port !== "") {
            return { kind: "ready", port } as const;
          }
        }
        yield* sleep(debuggingPortPollingMilliseconds);
      }
    },
    function* limitDebuggingPortWait() {
      yield* sleep(debuggingPortTimeoutMilliseconds);
      return { kind: "timeout" } as const;
    },
  ]);
  if (outcome.kind === "timeout") {
    throw new Error("Chromium 未在预期时间内开放本地控制连接");
  }
  if (outcome.kind === "failed") {
    throw outcome.error;
  }
  return outcome.port;
}

export function* stopBrowserSession(session: BrowserSession): RiteCoroutine<void> {
  if (session.browserProcess.pid === undefined || hasBrowserProcessExited(session.browserProcess)) {
    return;
  }
  const exitedProcess = once(session.browserProcess, "exit");
  session.browserProcess.kill("SIGTERM");
  const exited = yield* race([
    function* waitForExit() {
      yield* until(() => exitedProcess);
      return true;
    },
    function* waitForGracePeriod() {
      yield* sleep(browserStopGraceMilliseconds);
      return false;
    },
  ]);
  if (!exited && !hasBrowserProcessExited(session.browserProcess)) {
    session.browserProcess.kill("SIGKILL");
    yield* until(() => exitedProcess);
    throw new Error("Chromium 未能在宽限期内正常退出");
  }
}

export function* browserSession(
  profilePath: string,
  targetUrl: string,
  controlMode: "cdp" | "none",
): RiteCoroutine<BrowserSession> {
  const sessionFuture = yield* resource<BrowserSession>(function* manageBrowserSession(provide) {
    const scopeSignal = yield* abortSignal();
    const launchArguments = [
      `--user-data-dir=${profilePath}`,
      "--no-first-run",
      "--no-default-browser-check",
    ];
    if (controlMode === "cdp") {
      yield* until(() => rm(`${profilePath}/DevToolsActivePort`, { force: true }));
      launchArguments.push("--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0");
    }
    launchArguments.push(targetUrl);
    const browserProcess = spawn(resolveChromiumCommand(), launchArguments, { stdio: "ignore" });
    const session = { browserProcess, profilePath };
    function terminateOnAbort(): void {
      browserProcess.kill("SIGTERM");
    }
    scopeSignal.addEventListener("abort", terminateOnAbort, { once: true });
    try {
      yield* until(() => once(browserProcess, "spawn"));
      const debuggingPort =
        controlMode === "cdp" ? yield* readDebuggingPort(profilePath, browserProcess) : undefined;
      yield* provide(debuggingPort === undefined ? session : { ...session, debuggingPort });
    } finally {
      scopeSignal.removeEventListener("abort", terminateOnAbort);
      yield* stopBrowserSession(session);
    }
  });
  return yield* wait(sessionFuture);
}
