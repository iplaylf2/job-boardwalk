import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResultSchema,
  ToolListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { completer, createScope, until } from "@shajara/host";
import type { Completer, RiteCoroutine } from "@shajara/host";
import { race, wait } from "@shajara/host/primitives";
import { expect, test } from "vitest";

import { createBrowserSessionMcpServer } from "#/browser-session-mcp-server.js";
import { PlaywrightConnectionSupervisor } from "#/playwright-connection-supervisor.js";
import type { PlaywrightMcpClient } from "#/playwright-mcp-client.js";
import { WorkspaceServiceClient } from "#/workspace-service-client.js";

const firstContentIndex = 0;
const firstAttempt = 1;
const initialAttempt = 0;
const lastItemOffset = -1;
const noRetryDelay = 0;

function* callTool(): RiteCoroutine<CallToolResult> {
  yield* [];
  return { content: [{ text: "ok", type: "text" }] };
}

function* close(): RiteCoroutine<void> {
  yield* [];
}

function failOnReportedError(error: Error): never {
  throw error;
}

function readyClient(disconnected: Completer<Error>): PlaywrightMcpClient {
  return {
    callTool,
    close,
    disconnected: disconnected.future,
    tools: [
      {
        inputSchema: { properties: { action: { type: "string" } }, type: "object" },
        name: "browser_tabs",
      },
    ],
  } as unknown as PlaywrightMcpClient;
}

interface DiscoveryVerification {
  client: Client;
  connection: Completer<PlaywrightMcpClient>;
  disconnected: Completer<Error>;
  mcpServer: McpServer;
  toolListChanged: Completer<true>;
}

function* verifyDiscovery({
  client,
  connection,
  disconnected,
  mcpServer,
  toolListChanged,
}: DiscoveryVerification): RiteCoroutine<void> {
  const initialTools = yield* until(() => client.listTools());
  expect(initialTools.tools.map(({ name }) => name)).toEqual(["browser_observe_platform_access"]);
  connection.resolve(readyClient(disconnected));
  yield* wait(toolListChanged.future);
  const { tools } = yield* until(() => client.listTools());
  expect(tools.map(({ name }) => name)).toEqual([
    "browser_tabs",
    "browser_observe_platform_access",
  ]);
  expect(tools.at(lastItemOffset)?.annotations).toEqual({
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
    readOnlyHint: false,
  });
  yield* until(() => client.close());
  yield* until(() => mcpServer.close());
}

function* verifyStartupFailure(client: Client, mcpServer: McpServer): RiteCoroutine<void> {
  const result = CallToolResultSchema.parse(
    yield* until(() =>
      client.callTool({
        arguments: { platformId: "boss" },
        name: "browser_observe_platform_access",
      }),
    ),
  );
  expect(result.isError).toBe(true);
  expect(result.content[firstContentIndex]).toMatchObject({
    text: expect.stringContaining("extension tab is not bound"),
  });
  const { tools } = yield* until(() => client.listTools());
  expect(tools.map(({ name }) => name)).toEqual(["browser_observe_platform_access"]);
  yield* until(() => client.close());
  yield* until(() => mcpServer.close());
}

test("keeps downstream discovery alive while the browser connects", async () => {
  await using serviceScope = createScope();
  await serviceScope.run(function* connectDownstreamFirst() {
    const connection = yield* completer<PlaywrightMcpClient>();
    const disconnected = yield* completer<Error>();
    const playwrightConnection = new PlaywrightConnectionSupervisor();
    const mcpServer = createBrowserSessionMcpServer(
      "browser-session-test",
      playwrightConnection,
      new WorkspaceServiceClient(),
      serviceScope,
    );
    const client = new Client({ name: "browser-session-test-client", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const toolListChanged = yield* completer<true>();
    client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
      toolListChanged.resolve(true);
    });

    yield* until(() => mcpServer.connect(serverTransport));
    yield* until(() => client.connect(clientTransport));
    yield* race([
      () =>
        playwrightConnection.supervise({
          connect: function* connect() {
            return yield* wait(connection.future);
          },
          notifyToolsChanged: () => mcpServer.server.sendToolListChanged(),
          reportError: failOnReportedError,
        }),
      () => verifyDiscovery({ client, connection, disconnected, mcpServer, toolListChanged }),
    ]);
  });
});

test("surfaces an upstream startup failure without closing Browser Session", async () => {
  await using serviceScope = createScope();
  await serviceScope.run(function* containStartupFailure() {
    const retryConnection = yield* completer<PlaywrightMcpClient>();
    const errorReported = yield* completer<true>();
    const playwrightConnection = new PlaywrightConnectionSupervisor();
    let attempt = initialAttempt;
    const mcpServer = createBrowserSessionMcpServer(
      "browser-session-test",
      playwrightConnection,
      new WorkspaceServiceClient(),
      serviceScope,
    );
    const client = new Client({ name: "browser-session-test-client", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    yield* until(() => mcpServer.connect(serverTransport));
    yield* until(() => client.connect(clientTransport));
    yield* race([
      () =>
        playwrightConnection.supervise({
          connect: function* connect() {
            attempt += firstAttempt;
            if (attempt === firstAttempt) {
              throw new Error("extension tab is not bound");
            }
            return yield* wait(retryConnection.future);
          },
          notifyToolsChanged: () => Promise.resolve(),
          reportError: () => errorReported.resolve(true),
          retryDelay: () => noRetryDelay,
        }),
      function* verifyFailureIsContained() {
        yield* wait(errorReported.future);
        yield* verifyStartupFailure(client, mcpServer);
      },
    ]);
  });
});
