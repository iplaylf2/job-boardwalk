import { randomUUID } from "node:crypto";
import process from "node:process";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { completer, createScope, until } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";
import { race, wait } from "@shajara/host/primitives";

import {
  browserSessionOwnedToolNames,
  createBrowserSessionMcpServer,
} from "./browser-session-mcp-server.js";
import { PlaywrightConnectionSupervisor } from "./playwright-connection-supervisor.js";
import { connectPlaywrightMcpClient } from "./playwright-mcp-client.js";
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

function reportBrowserConnectionError(error: Error): void {
  process.stderr.write(`[Browser Session] ${error.stack ?? error.message}\n`);
}

function* runBrowserSession(serviceScope: Scope): RiteCoroutine<void> {
  const playwrightEndpoint = resolvePlaywrightMcpEndpoint();
  const shutdown = yield* completer<true>();
  const removeShutdownHandlers = installShutdownHandlers(() => shutdown.resolve(true));
  try {
    const playwrightConnection = new PlaywrightConnectionSupervisor();
    const mcpServer = createBrowserSessionMcpServer(
      randomUUID(),
      playwrightConnection,
      new WorkspaceServiceClient(),
      serviceScope,
    );
    try {
      yield* until(() => mcpServer.connect(new StdioServerTransport()));
      yield* race([
        () =>
          playwrightConnection.supervise({
            connect: () =>
              connectPlaywrightMcpClient(playwrightEndpoint, browserSessionOwnedToolNames),
            notifyToolsChanged: () => mcpServer.server.sendToolListChanged(),
            reportError: reportBrowserConnectionError,
          }),
        () => wait(shutdown.future),
      ]);
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
