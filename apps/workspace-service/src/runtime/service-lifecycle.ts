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
process.umask(privateFileCreationMask);

export interface WorkspaceServiceOptions {
  readonly databasePath?: string;
  readonly httpServerAddress?: HttpServerAddress;
  readonly migrationsDirectory?: string;
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
  const removeShutdownHandlers = installShutdownHandlers(() => shutdown.resolve(true));
  try {
    yield* wait(shutdown.future);
  } finally {
    removeShutdownHandlers();
    try {
      yield* until(() => closeHttpServer(httpServer));
    } finally {
      repository.close();
    }
  }
}
