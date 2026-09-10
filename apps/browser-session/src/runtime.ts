// oxlint-disable import/max-dependencies -- The process composition root assembles concrete browser, HTTP, and workspace clients.
import process from "node:process";
import type { BrowserRuntimeStatus } from "@job-boardwalk/contracts";

import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { completer, createScope, until } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";
import { race, wait } from "@shajara/host/primitives";

import { ManagedBrowser } from "./browser/managed-browser.js";
import type { BrowserChannel } from "./browser/persistent-context-launch.js";
import { prepareBrowserProfilePath } from "./browser/profile-path.js";
import { createBrowserSessionHttpApp } from "./http/app.js";
import { PlatformAccessObservationReporter } from "./workspace-service/platform-access-observation-reporter.js";
import { resolveWorkspaceServiceUrl } from "./workspace-service/configuration.js";
import { WorkspaceJobEngagementWriter } from "./workspace-service/job-engagement-writer.js";
import { WorkspaceJobObservationWriter } from "./workspace-service/job-observation-writer.js";

const browserSessionPort = 54_312;
const serverNotRunningErrorCode = "ERR_SERVER_NOT_RUNNING";

interface HttpServerAddress {
  readonly hostname: string;
  readonly port: number;
}

export interface BrowserSessionProcessOptions {
  readonly browserChannel?: BrowserChannel;
  readonly browserExecutablePath?: string;
  readonly httpServerAddress?: HttpServerAddress;
  readonly profilePath?: string;
  readonly shutdownSignal?: AbortSignal;
  readonly workspaceServiceUrl?: URL;
}

export function closeHttpServer(httpServer: ServerType): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    httpServer.close((error?: Error) => {
      if (error && (error as NodeJS.ErrnoException).code !== serverNotRunningErrorCode) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function errorDetail(error: Error): string {
  return error.stack || error.message || error.name;
}

function reportBrowserError(error: Error): void {
  process.stderr.write(`[${new Date().toISOString()}] [Browser Session] ${errorDetail(error)}\n`);
}

function reportPlatformAccessError(error: Error): void {
  process.stderr.write(
    `[${new Date().toISOString()}] [Browser Session → Workspace Service] ${errorDetail(error)}\n`,
  );
}

function reportBrowserLifecycle(status: BrowserRuntimeStatus): void {
  process.stderr.write(
    `[${new Date().toISOString()}] [Browser lifecycle] ${JSON.stringify(status)}\n`,
  );
}

function connectShutdownSignal(
  signal: AbortSignal | undefined,
  requestShutdown: () => void,
): () => void {
  if (signal?.aborted) {
    requestShutdown();
  } else {
    signal?.addEventListener("abort", requestShutdown, { once: true });
  }
  return () => signal?.removeEventListener("abort", requestShutdown);
}

function* runBrowserSession(
  serviceScope: Scope,
  options: BrowserSessionProcessOptions,
): RiteCoroutine<void> {
  const profilePath = yield* prepareBrowserProfilePath(options.profilePath);
  const workspaceServiceUrl = options.workspaceServiceUrl ?? resolveWorkspaceServiceUrl();
  const browserControl = new ManagedBrowser(profilePath, {
    jobEngagementWriter: new WorkspaceJobEngagementWriter(workspaceServiceUrl),
    jobObservationWriter: new WorkspaceJobObservationWriter(workspaceServiceUrl),
    ...(options.browserChannel ? { browserChannel: options.browserChannel } : {}),
    ...(options.browserExecutablePath
      ? { browserExecutablePath: options.browserExecutablePath }
      : {}),
  });
  const platformAccessReporter = new PlatformAccessObservationReporter(
    workspaceServiceUrl,
    () => browserControl.platformAccessObservations,
  );
  const httpApp = createBrowserSessionHttpApp({
    browserControl,
    serviceScope,
  });
  const httpServer = serve(
    {
      fetch: httpApp.fetch,
      ...(options.httpServerAddress ?? {
        hostname: "127.0.0.1",
        port: browserSessionPort,
      }),
    },
    (info) => {
      process.stdout.write(`Browser Session: http://${info.address}:${info.port}\n`);
    },
  );
  const shutdown = yield* completer<true>();
  function requestShutdown(): void {
    shutdown.resolve(true);
  }
  const disconnectShutdownSignal = connectShutdownSignal(options.shutdownSignal, requestShutdown);
  try {
    yield* race([
      () => browserControl.supervise(reportBrowserError, reportBrowserLifecycle),
      () => platformAccessReporter.run(reportPlatformAccessError),
      () => wait(shutdown.future),
    ]);
  } finally {
    disconnectShutdownSignal();
    yield* until(() => closeHttpServer(httpServer));
  }
}

export async function runBrowserSessionProcess(
  options: BrowserSessionProcessOptions = {},
): Promise<void> {
  await using serviceScope = createScope();
  await serviceScope.run(() => runBrowserSession(serviceScope, options));
}
