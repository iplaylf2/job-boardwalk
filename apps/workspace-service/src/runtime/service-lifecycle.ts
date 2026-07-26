import process from "node:process";
import path from "node:path";

import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { completer, until } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";
import { wait } from "@shajara/host/primitives";

import { createWorkspaceServiceHttpApp } from "#/http/app.js";
import { prepareWorkspaceDatabasePath } from "#/persistence/database-path.js";
import { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import { BrowserSessionPresenceTracker } from "#/runtime/browser-session-presence.js";
import { resolveHttpServerAddress } from "#/runtime/http-server-address.js";
import type { HttpServerAddress } from "#/runtime/http-server-address.js";

const privateFileCreationMask = 0o077;
const serverNotRunningErrorCode = "ERR_SERVER_NOT_RUNNING";
process.umask(privateFileCreationMask);

export interface WorkspaceServiceOptions {
  readonly databasePath?: string;
  readonly httpServerAddress?: HttpServerAddress;
  readonly migrationsDirectory?: string;
  readonly shutdownSignal?: AbortSignal;
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

export function* runWorkspaceService(
  serviceScope: Scope,
  options: WorkspaceServiceOptions = {},
): RiteCoroutine<void> {
  const httpServerAddress = options.httpServerAddress ?? resolveHttpServerAddress();
  const databasePath = yield* prepareWorkspaceDatabasePath(options.databasePath);
  const migrationsDirectory =
    options.migrationsDirectory ?? path.resolve(import.meta.dirname, "migrations");
  const repository = new WorkspaceRepository({ databasePath, migrationsDirectory });
  const browserSessionPresenceTracker = new BrowserSessionPresenceTracker();
  const httpApp = createWorkspaceServiceHttpApp({
    browserSessionPresenceTracker,
    repository,
    serviceScope,
  });
  const httpServer = serve({ fetch: httpApp.fetch, ...httpServerAddress }, (info) => {
    process.stdout.write(`Workspace Service: http://${info.address}:${info.port}\n`);
  });
  const shutdown = yield* completer<true>();
  function requestShutdown(): void {
    shutdown.resolve(true);
  }
  const disconnectShutdownSignal = connectShutdownSignal(options.shutdownSignal, requestShutdown);
  try {
    yield* wait(shutdown.future);
  } finally {
    disconnectShutdownSignal();
    try {
      yield* until(() => closeHttpServer(httpServer));
    } finally {
      repository.close();
    }
  }
}
