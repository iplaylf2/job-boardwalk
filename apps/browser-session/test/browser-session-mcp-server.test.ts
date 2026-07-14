import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResultSchema,
  ToolListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { PlatformAccessObservationInput } from "@job-boardwalk/contracts";
import { completer, createScope, until } from "@shajara/host";
import type { Completer, RiteCoroutine } from "@shajara/host";
import { race, wait } from "@shajara/host/primitives";
import { expect, test } from "vitest";

import { createBrowserSessionMcpServer } from "#/browser-session-mcp-server.js";
import type { PlatformAccessObservationWriter } from "#/browser-session-mcp-server.js";
import { PlaywrightConnectionSupervisor } from "#/playwright-connection-supervisor.js";
import type { PlaywrightMcpClient } from "#/playwright-mcp-client.js";

const firstContentIndex = 0;
const firstAttempt = 1;
const initialAttempt = 0;
const noRetryDelay = 0;
const openPlatformToolName = "browser_open_platform";
const testBrowserSessionId = "browser-session-test";

function createEncodedResult(snapshot: Record<string, unknown>): CallToolResult {
  const payload = Buffer.from(JSON.stringify(snapshot), "utf8").toString("base64");
  return {
    content: [
      { text: `### Result\n"JOB_BOARDWALK_PLATFORM_PAGE_SNAPSHOT:${payload}"`, type: "text" },
    ],
  };
}

function* callTool(params: { name: string }): RiteCoroutine<CallToolResult> {
  yield* [];
  if (params.name === "browser_evaluate") {
    return createEncodedResult({
      accountIdentityVisible: false,
      loginControlVisible: true,
      text: "手机号登录",
      title: "BOSS直聘",
      url: "https://www.zhipin.com/web/user/",
      verificationControlVisible: false,
    });
  }
  return { content: [{ text: "ok", type: "text" }] };
}

function* close(): RiteCoroutine<void> {
  yield* [];
}

function failOnReportedError(error: Error): never {
  throw error;
}

function expectToolNames(
  tools: readonly { name: string }[],
  expectedNames: readonly string[],
): void {
  expect(tools.map(({ name }) => name).toSorted()).toEqual(expectedNames.toSorted());
}

function createObservationWriter(
  observations: PlatformAccessObservationInput[],
): PlatformAccessObservationWriter {
  return {
    recordPlatformAccessObservation: function* recordPlatformAccessObservation(observation) {
      observations.push(observation);
      yield* [];
    },
  };
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
  observations: PlatformAccessObservationInput[];
  toolListChanged: Completer<true>;
}

function* verifyStableAccessOutcome(
  client: Client,
  observations: PlatformAccessObservationInput[],
): RiteCoroutine<void> {
  const observedResult = CallToolResultSchema.parse(
    yield* until(() =>
      client.callTool({
        arguments: { platformId: "boss" },
        name: "browser_observe_platform_access",
      }),
    ),
  );
  expect(observedResult.content[firstContentIndex]).toMatchObject({
    text: JSON.stringify({
      assessment: { authenticationState: "unauthenticated", evidence: "login-page" },
      outcome: "login-required",
    }),
  });
  expect(observations).toEqual([
    {
      authenticationState: "unauthenticated",
      browserSessionId: testBrowserSessionId,
      evidence: "login-page",
      observedAt: expect.any(String),
      platformId: "boss",
    },
  ]);
}

function* verifyDiscovery({
  client,
  connection,
  disconnected,
  mcpServer,
  observations,
  toolListChanged,
}: DiscoveryVerification): RiteCoroutine<void> {
  const initialTools = yield* until(() => client.listTools());
  expectToolNames(initialTools.tools, ["browser_observe_platform_access", openPlatformToolName]);
  connection.resolve(readyClient(disconnected));
  yield* wait(toolListChanged.future);
  const { tools } = yield* until(() => client.listTools());
  expectToolNames(tools, ["browser_tabs", "browser_observe_platform_access", openPlatformToolName]);
  expect(tools.find(({ name }) => name === openPlatformToolName)?.annotations).toEqual({
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
    readOnlyHint: false,
  });
  const forwardedResult = CallToolResultSchema.parse(
    yield* until(() =>
      client.callTool({
        arguments: { action: "list" },
        name: "browser_tabs",
      }),
    ),
  );
  expect(forwardedResult.content[firstContentIndex]).toMatchObject({ text: "ok" });
  yield* verifyStableAccessOutcome(client, observations);
  yield* until(() => client.close());
  yield* until(() => mcpServer.close());
}

function* verifyStartupFailure(client: Client, mcpServer: McpServer): RiteCoroutine<void> {
  const unavailableOpenResult = CallToolResultSchema.parse(
    yield* until(() =>
      client.callTool({
        arguments: { platformId: "boss" },
        name: openPlatformToolName,
      }),
    ),
  );
  expect(unavailableOpenResult.isError).toBe(true);
  expect(unavailableOpenResult.content[firstContentIndex]).toMatchObject({
    text: expect.stringContaining("extension tab is not bound"),
  });
  const { tools } = yield* until(() => client.listTools());
  expectToolNames(tools, ["browser_observe_platform_access", openPlatformToolName]);
  yield* until(() => client.close());
  yield* until(() => mcpServer.close());
}

test("keeps downstream discovery alive while the browser connects", async () => {
  await using serviceScope = createScope();
  await serviceScope.run(function* connectDownstreamFirst() {
    const connection = yield* completer<PlaywrightMcpClient>();
    const disconnected = yield* completer<Error>();
    const observations: PlatformAccessObservationInput[] = [];
    const playwrightConnection = new PlaywrightConnectionSupervisor();
    const mcpServer = createBrowserSessionMcpServer(
      testBrowserSessionId,
      playwrightConnection,
      createObservationWriter(observations),
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
      () =>
        verifyDiscovery({
          client,
          connection,
          disconnected,
          mcpServer,
          observations,
          toolListChanged,
        }),
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
      testBrowserSessionId,
      playwrightConnection,
      createObservationWriter([]),
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
