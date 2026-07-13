import path from "node:path";
import process from "node:process";

import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { getDataDirectory, prepareStorageLayout } from "@job-boardwalk/storage-layout";
import { createScope, resource } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { wait } from "@shajara/host/primitives";

import { PlaywrightPlatformBrowser } from "./browser/playwright-platform-browser.js";
import type { PlatformBrowser } from "./browser/playwright-platform-browser.js";
import { createRuntimeHttpApp } from "./http/app.js";
import { WorkspaceRepository } from "./persistence/workspace-repository.js";

const privateFileCreationMask = 0o077;
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

function* acquirePlatformBrowser(repository: WorkspaceRepository): RiteCoroutine<PlatformBrowser> {
  const platformBrowserFuture = yield* resource<PlatformBrowser>(
    function* maintainPlatformBrowser(provide) {
      const platformBrowser = new PlaywrightPlatformBrowser((platformId, observedAt) =>
        repository.recordAuthenticationObservation(platformId, observedAt),
      );
      try {
        yield* provide(platformBrowser);
      } finally {
        yield* platformBrowser.close();
      }
    },
  );
  return yield* wait(platformBrowserFuture);
}

async function main(): Promise<void> {
  await using runtimeScope = createScope();
  await runtimeScope.run(prepareStorageLayout);
  const repository = new WorkspaceRepository(path.join(getDataDirectory(), "workspace.sqlite"));
  const platformBrowser = await runtimeScope.run(() => acquirePlatformBrowser(repository));
  const httpApp = createRuntimeHttpApp(repository, runtimeScope, platformBrowser);
  const httpServer = serve(
    { fetch: httpApp.fetch, hostname: "127.0.0.1", port: 54_310 },
    (info) => {
      process.stdout.write(`Job Boardwalk: http://${info.address}:${info.port}\n`);
    },
  );
  const { promise: shutdownRequested, resolve: resolveShutdownRequest } =
    Promise.withResolvers<true>();
  process.once("SIGINT", () => resolveShutdownRequest(true));
  process.once("SIGTERM", () => resolveShutdownRequest(true));
  try {
    await Promise.race([shutdownRequested, runtimeScope.closed]);
  } finally {
    const httpServerClosed = closeHttpServer(httpServer);
    try {
      await runtimeScope.cancel();
    } finally {
      try {
        await httpServerClosed;
      } finally {
        repository.close();
      }
    }
  }
}

await main();
