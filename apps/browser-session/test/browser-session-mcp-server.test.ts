import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { completer, createScope, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { expect, test } from "vitest";

import { createBrowserSessionMcpServer } from "#/browser-session-mcp-server.js";
import type { PlaywrightMcpClient } from "#/playwright-mcp-client.js";
import { WorkspaceServiceClient } from "#/workspace-service-client.js";

const firstContentIndex = 0;
const lastItemOffset = -1;

function* failBrowserTool(): RiteCoroutine<CallToolResult> {
  yield* [];
  throw new Error("upstream transport closed");
}

test("completes downstream protocol initialization before the upstream browser is ready", async () => {
  await using serviceScope = createScope();
  await serviceScope.run(function* connectDownstreamFirst() {
    const upstream = yield* completer<PlaywrightMcpClient>();
    const server = createBrowserSessionMcpServer(
      "browser-session-test",
      upstream.future,
      new WorkspaceServiceClient(),
      serviceScope,
    );
    const client = new Client({ name: "browser-session-test-client", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    yield* until(() => server.connect(serverTransport));
    yield* until(() => client.connect(clientTransport));

    upstream.resolve({
      tools: [
        {
          inputSchema: { properties: { action: { type: "string" } }, type: "object" },
          name: "browser_tabs",
        },
      ],
    } as unknown as PlaywrightMcpClient);
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
    yield* until(() => server.close());
  });
});

test("contains an upstream tool failure without closing the Browser Session", async () => {
  await using serviceScope = createScope();
  await serviceScope.run(function* containToolFailure() {
    const upstream = yield* completer<PlaywrightMcpClient>();
    const server = createBrowserSessionMcpServer(
      "browser-session-test",
      upstream.future,
      new WorkspaceServiceClient(),
      serviceScope,
    );
    const client = new Client({ name: "browser-session-test-client", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    yield* until(() => server.connect(serverTransport));
    yield* until(() => client.connect(clientTransport));
    upstream.resolve({
      callTool: failBrowserTool,
      tools: [
        {
          inputSchema: { properties: {}, type: "object" },
          name: "browser_navigate",
        },
      ],
    } as unknown as PlaywrightMcpClient);

    const result = CallToolResultSchema.parse(
      yield* until(() => client.callTool({ name: "browser_navigate" })),
    );
    expect(result.isError).toBe(true);
    expect(result.content[firstContentIndex]).toMatchObject({ text: "upstream transport closed" });
    const { tools } = yield* until(() => client.listTools());
    expect(tools.map(({ name }) => name)).toContain("browser_navigate");

    yield* until(() => client.close());
    yield* until(() => server.close());
  });
});
