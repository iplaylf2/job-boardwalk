import process from "node:process";
import path from "node:path";

import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { completer, createScope, until } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";
import { wait } from "@shajara/host/primitives";

import { createWorkspaceServiceHttpApp } from "./http/app.js";
import { prepareWorkspaceDatabasePath } from "./persistence/database-path.js";
import { WorkspaceRepository } from "./persistence/workspace-repository.js";
import { BrowserSessionPresenceTracker } from "./runtime/browser-session-presence.js";

const privateFileCreationMask = 0o077;
const migrationsDirectory = path.resolve(import.meta.dirname, "../migrations");
process.umask(privateFileCreationMask);

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

function* runWorkspaceService(serviceScope: Scope): RiteCoroutine<void> {
  const databasePath = yield* prepareWorkspaceDatabasePath();
  const repository = new WorkspaceRepository({ databasePath, migrationsDirectory });
  const browserSessionPresenceTracker = new BrowserSessionPresenceTracker();
  const httpApp = createWorkspaceServiceHttpApp({
    browserSessionPresenceTracker,
    repository,
    serviceScope,
  });
  const httpServer = serve(
    { fetch: httpApp.fetch, hostname: "127.0.0.1", port: 54_310 },
    (info) => {
      process.stdout.write(`Workspace Service: http://${info.address}:${info.port}\n`);
    },
  );
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

async function main(): Promise<void> {
  await using serviceScope = createScope();
  await serviceScope.run(() => runWorkspaceService(serviceScope));
}

await main();
