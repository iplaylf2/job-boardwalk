import { randomUUID } from "node:crypto";
import process from "node:process";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { completer, createScope, resource, until } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";
import { spawn, wait } from "@shajara/host/primitives";

import {
  createBrowserSessionMcpServer,
  observePlatformAccessToolName,
} from "./browser-session-mcp-server.js";
import { connectPlaywrightMcpClient } from "./playwright-mcp-client.js";
import type { PlaywrightMcpClient } from "./playwright-mcp-client.js";
import { WorkspaceServiceClient } from "./workspace-service-client.js";

function resolvePlaywrightMcpEndpoint(): URL {
  const configuredEndpoint = process.env["JOB_BOARDWALK_PLAYWRIGHT_MCP_URL"]?.trim();
  if (!configuredEndpoint) {
    throw new Error(
      "请将 JOB_BOARDWALK_PLAYWRIGHT_MCP_URL 设置为图形主机上 Playwright MCP 的 /mcp 端点。",
    );
  }
  const endpoint = new URL(configuredEndpoint);
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    throw new Error("JOB_BOARDWALK_PLAYWRIGHT_MCP_URL 必须是 HTTP 或 HTTPS URL。");
  }
  return endpoint;
}

function installShutdownHandlers(requestShutdown: () => void): () => void {
  process.once("SIGINT", requestShutdown);
  process.once("SIGTERM", requestShutdown);
  process.stdin.once("end", requestShutdown);
  return () => {
    process.removeListener("SIGINT", requestShutdown);
    process.removeListener("SIGTERM", requestShutdown);
    process.stdin.removeListener("end", requestShutdown);
  };
}

function* runBrowserSession(serviceScope: Scope): RiteCoroutine<void> {
  const shutdown = yield* completer<true>();
  const removeShutdownHandlers = installShutdownHandlers(() => shutdown.resolve(true));
  try {
    const playwrightClientFuture = yield* resource<PlaywrightMcpClient>(
      function* ownPlaywrightMcpClient(provide) {
        const playwrightClient = yield* connectPlaywrightMcpClient(resolvePlaywrightMcpEndpoint(), [
          observePlatformAccessToolName,
        ]);
        try {
          yield* provide(playwrightClient);
        } finally {
          yield* playwrightClient.close();
        }
      },
    );
    const { mcpServer, notifyBrowserToolsWhenReady } = createBrowserSessionMcpServer(
      randomUUID(),
      playwrightClientFuture,
      new WorkspaceServiceClient(),
      serviceScope,
    );
    try {
      yield* until(() => mcpServer.connect(new StdioServerTransport()));
      yield* spawn(notifyBrowserToolsWhenReady);
      yield* wait(shutdown.future);
    } finally {
      yield* until(() => mcpServer.close());
    }
  } finally {
    removeShutdownHandlers();
  }
}

async function main(): Promise<void> {
  await using serviceScope = createScope();
  await serviceScope.run(() => runBrowserSession(serviceScope));
}

await main();
