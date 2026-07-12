import path from "node:path";
import process from "node:process";

import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { getDataDirectory, prepareStorageLayout } from "@job-boardwalk/storage-layout";
import { createScope } from "@shajara/host";

import { createStateServiceApp } from "./app.js";
import { WorkspaceDatabase } from "./database.js";

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
  await using serviceScope = createScope();
  await serviceScope.run(prepareStorageLayout);
  const database = new WorkspaceDatabase(path.join(getDataDirectory(), "workspace.sqlite"));
  const app = createStateServiceApp(database, serviceScope);
  const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 4310 }, (info) => {
    process.stdout.write(`Job Boardwalk: http://${info.address}:${info.port}\n`);
  });
  const shutdown = Promise.withResolvers<true>();
  process.once("SIGINT", () => shutdown.resolve(true));
  process.once("SIGTERM", () => shutdown.resolve(true));
  try {
    await Promise.race([shutdown.promise, serviceScope.closed]);
  } finally {
    await closeServer(server);
    database.close();
  }
}

await main();
