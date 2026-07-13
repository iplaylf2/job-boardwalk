import { randomUUID } from "node:crypto";
import process from "node:process";

import { createConnection } from "@playwright/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { chromium } from "playwright";
import type { BrowserContext } from "playwright";
import { completer, createScope, resource, until } from "@shajara/host";
import type { RiteCoroutine, RiteFuture, Scope } from "@shajara/host";
import { spawn, wait } from "@shajara/host/primitives";

import { prepareBrowserStorage } from "./browser-storage.js";
import { observePlatformAccess } from "./platform-access/observer.js";
import { WorkspaceServiceClient } from "./workspace-service-client.js";

const defaultBrowserChannel = "msedge";

function resolveBrowserChannel(): string {
  const configuredChannel = process.env["JOB_BOARDWALK_BROWSER_CHANNEL"]?.trim();
  return configuredChannel || defaultBrowserChannel;
}

function installShutdownHandlers(requestShutdown: () => void): () => void {
  function closeOnSignal(): void {
    requestShutdown();
  }
  process.once("SIGINT", closeOnSignal);
  process.once("SIGTERM", closeOnSignal);
  process.stdin.once("end", closeOnSignal);
  return () => {
    process.removeListener("SIGINT", closeOnSignal);
    process.removeListener("SIGTERM", closeOnSignal);
    process.stdin.removeListener("end", closeOnSignal);
  };
}

function* runBrowserSession(serviceScope: Scope): RiteCoroutine<void> {
  const { artifactsDirectory, profileDirectory } = yield* prepareBrowserStorage();
  const browserSessionId = randomUUID();
  const workspaceServiceClient = new WorkspaceServiceClient();
  let browserContextFuture: RiteFuture<BrowserContext> | null = null;
  function* acquireBrowserContext(): RiteCoroutine<BrowserContext> {
    browserContextFuture ??= yield* resource<BrowserContext>(function* ownBrowserContext(provide) {
      const context = yield* until(() =>
        chromium.launchPersistentContext(profileDirectory, {
          channel: resolveBrowserChannel(),
          headless: false,
        }),
      );
      yield* spawn(function* observeBrowserPlatformAccess() {
        return yield* observePlatformAccess(browserSessionId, context, workspaceServiceClient);
      });
      try {
        return yield* provide(context);
      } finally {
        yield* until(() => context.close());
      }
    });
    return yield* wait(browserContextFuture);
  }
  const mcpServer = yield* until(() =>
    createConnection(
      {
        outputDir: artifactsDirectory,
        sharedBrowserContext: true,
      },
      () => serviceScope.run(acquireBrowserContext),
    ),
  );
  const shutdown = yield* completer<true>();
  const removeShutdownHandlers = installShutdownHandlers(() => shutdown.resolve(true));
  const transport = new StdioServerTransport();
  try {
    yield* until(() => mcpServer.connect(transport));
    yield* wait(shutdown.future);
  } finally {
    removeShutdownHandlers();
    yield* until(() => mcpServer.close());
  }
}

async function main(): Promise<void> {
  await using serviceScope = createScope();
  await serviceScope.run(() => runBrowserSession(serviceScope));
}

await main();
