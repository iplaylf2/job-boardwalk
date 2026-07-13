import path from "node:path";
import process from "node:process";

import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { getDataDirectory, prepareStorageLayout } from "@job-boardwalk/storage-layout";
import { createScope } from "@shajara/host";

import { PlaywrightPlatformBrowser } from "./browser/playwright-platform-browser.js";
import { createHttpApi } from "./http-api.js";
import { WorkspaceRepository } from "./persistence/workspace-repository.js";

const privateFileCreationMask = 0o077;
process.umask(privateFileCreationMask);

function closeServer(server: ServerType): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function main(): Promise<void> {
  await using runtimeScope = createScope();
  await runtimeScope.run(prepareStorageLayout);
  const repository = new WorkspaceRepository(path.join(getDataDirectory(), "workspace.sqlite"));
  const platformBrowser = new PlaywrightPlatformBrowser((platformId, observedAt) =>
    repository.recordAuthenticationObservation(platformId, observedAt),
  );
  const httpApi = createHttpApi(repository, runtimeScope, platformBrowser);
  const server = serve({ fetch: httpApi.fetch, hostname: "127.0.0.1", port: 4310 }, (info) => {
    process.stdout.write(`Job Boardwalk: http://${info.address}:${info.port}\n`);
  });
  const shutdown = Promise.withResolvers<true>();
  process.once("SIGINT", () => shutdown.resolve(true));
  process.once("SIGTERM", () => shutdown.resolve(true));
  try {
    await Promise.race([shutdown.promise, runtimeScope.closed]);
  } finally {
    await closeServer(server);
    await platformBrowser.close();
    repository.close();
  }
}

await main();
