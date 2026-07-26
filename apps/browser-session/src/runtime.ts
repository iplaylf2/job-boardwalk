import process from "node:process";

import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { completer, createScope, until } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";
import { race, wait } from "@shajara/host/primitives";

import { ManagedBrowser } from "./browser/managed-browser.js";
import { prepareBrowserProfilePath } from "./browser/profile-path.js";
import { createBrowserSessionHttpApp } from "./http/app.js";
import {
  BrowserSessionStatusReporter,
  resolveWorkspaceServiceUrl,
} from "./workspace-service/status-reporter.js";
import { createWorkspaceServiceClients } from "./workspace-service/dependencies.js";

const browserSessionPort = 54_312;

export interface BrowserSessionProcessOptions {
  readonly browserExecutablePath?: string;
  readonly profilePath?: string;
}

function closeHttpServer(httpServer: ServerType): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    httpServer.close((error?: Error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function installShutdownHandlers(requestShutdown: () => void): () => void {
  process.once("SIGINT", requestShutdown);
  process.once("SIGTERM", requestShutdown);
  const shutdownOnStdinEnd = process.argv.includes("--shutdown-on-stdin-end");
  if (shutdownOnStdinEnd) {
    process.stdin.once("end", requestShutdown);
    process.stdin.resume();
  }
  return () => {
    if (shutdownOnStdinEnd) {
      process.stdin.pause();
      process.stdin.removeListener("end", requestShutdown);
    }
    process.removeListener("SIGINT", requestShutdown);
    process.removeListener("SIGTERM", requestShutdown);
  };
}

function errorDetail(error: Error): string {
  return error.stack || error.message || error.name;
}

function reportBrowserError(error: Error): void {
  process.stderr.write(`[Browser Session] ${errorDetail(error)}\n`);
}

function reportWorkspaceStatusError(error: Error): void {
  process.stderr.write(`[Browser Session → Workspace Service] ${errorDetail(error)}\n`);
}

function* runBrowserSession(
  serviceScope: Scope,
  options: BrowserSessionProcessOptions,
): RiteCoroutine<void> {
  const profilePath = yield* prepareBrowserProfilePath(options.profilePath);
  const workspaceServiceUrl = resolveWorkspaceServiceUrl();
  const browserControl = new ManagedBrowser(profilePath, {
    ...createWorkspaceServiceClients(workspaceServiceUrl),
    ...(options.browserExecutablePath ? { executablePath: options.browserExecutablePath } : {}),
  });
  const statusReporter = new BrowserSessionStatusReporter(
    workspaceServiceUrl,
    () => browserControl.status,
    () => browserControl.platformAccessObservations,
  );
  const httpApp = createBrowserSessionHttpApp({
    browserControl,
    serviceScope,
  });
  const httpServer = serve(
    { fetch: httpApp.fetch, hostname: "127.0.0.1", port: browserSessionPort },
    (info) => {
      process.stdout.write(`Browser Session: http://${info.address}:${info.port}\n`);
    },
  );
  const shutdown = yield* completer<true>();
  const removeShutdownHandlers = installShutdownHandlers(() => shutdown.resolve(true));
  try {
    yield* race([
      () => browserControl.supervise(reportBrowserError),
      () => statusReporter.run(reportWorkspaceStatusError),
      () => wait(shutdown.future),
    ]);
  } finally {
    removeShutdownHandlers();
    yield* until(() => closeHttpServer(httpServer));
  }
}

export async function runBrowserSessionProcess(
  options: BrowserSessionProcessOptions = {},
): Promise<void> {
  await using serviceScope = createScope();
  await serviceScope.run(() => runBrowserSession(serviceScope, options));
}
