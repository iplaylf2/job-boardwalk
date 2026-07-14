import process from "node:process";

import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { completer, createScope, until } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";
import { race, wait } from "@shajara/host/primitives";

import { CdpBrowserConnection } from "./cdp/browser-connection.js";
import { resolveCdpConnectionOptions } from "./cdp/connection-options.js";
import { CdpProxyTunnel, resolveDirectCdpEndpoint } from "./cdp/proxy-tunnel.js";
import { createBrowserSessionHttpApp } from "./http/app.js";

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

function reportBrowserConnectionError(error: Error): void {
  process.stderr.write(`[Browser Session] ${error.stack ?? error.message}\n`);
}

function* runBrowserSession(serviceScope: Scope): RiteCoroutine<void> {
  const connectionOptions = resolveCdpConnectionOptions();
  const tunnel = connectionOptions.proxy
    ? new CdpProxyTunnel(connectionOptions.endpoint, connectionOptions.proxy)
    : null;
  if (tunnel) {
    yield* until(() => tunnel.start());
  }
  const cdpEndpoint = tunnel
    ? tunnel.endpoint
    : resolveDirectCdpEndpoint(connectionOptions.endpoint);
  const browserBackend = new CdpBrowserConnection(cdpEndpoint);
  const httpApp = createBrowserSessionHttpApp({
    browserBackend,
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
      () => browserBackend.supervise(reportBrowserConnectionError),
      () => wait(shutdown.future),
    ]);
  } finally {
    removeShutdownHandlers();
    yield* until(() => closeHttpServer(httpServer));
    if (tunnel) {
      yield* until(() => tunnel.close());
    }
  }
}

async function main(): Promise<void> {
  await using serviceScope = createScope();
  await serviceScope.run(() => runBrowserSession(serviceScope));
}

await main();
