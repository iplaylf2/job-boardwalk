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
  return () => {
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

function* runBrowserSession(serviceScope: Scope): RiteCoroutine<void> {
  const profilePath = yield* prepareBrowserProfilePath();
  const workspaceServiceUrl = resolveWorkspaceServiceUrl();
  const browserControl = new ManagedBrowser(
    profilePath,
    createWorkspaceServiceClients(workspaceServiceUrl),
  );
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

async function main(): Promise<void> {
  await using serviceScope = createScope();
  await serviceScope.run(() => runBrowserSession(serviceScope));
}

await main();
